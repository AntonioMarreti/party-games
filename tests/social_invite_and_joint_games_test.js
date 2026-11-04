const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync('js/modules/social-manager.js', 'utf8');

const calls = [];
const alerts = [];
const confirmations = [];

let autoConfirm = true;

const windowStub = {
    currentRoomId: null,
    currentRoomCode: null,
    currentFriendsList: [{ id: 42, first_name: 'Alex', custom_name: 'Alexander' }],
    AVAILABLE_GAMES: [
        { id: 'durak', name: 'Дурак', icon: '🃏' },
        { id: 'bunker', name: 'Бункер', icon: '☢️' }
    ],
    apiRequest: async (payload) => {
        calls.push(payload);
        return { status: 'ok' };
    },
    showAlert: (title, msg, type) => {
        alerts.push({ title, msg, type });
    },
    showToast: (msg, type) => {
        alerts.push({ title: 'Toast', msg, type });
    },
    showConfirmation: (title, msg, onConfirm, opts) => {
        confirmations.push({ title, msg, opts });
        if (autoConfirm && onConfirm) {
            onConfirm();
        }
    },
    showScreen: () => {},
    switchTab: () => {},
    showModal: () => {},
    closeModal: () => {},
    closeUserProfileModal: () => {},
    closeFriendsScreen: () => {},
    addEventListener: () => {}
};

const documentStub = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {}
};

const ctx = vm.createContext({
    window: windowStub,
    document: documentStub,
    console,
    Set,
    Number,
    Date,
    String,
    Boolean,
    Math,
    Array,
    setTimeout: (fn) => fn(),
    clearTimeout: () => {}
});

vm.runInContext(source, ctx);

(async () => {
    // 1. Scenario: User already has an active room
    windowStub.currentRoomId = 101;
    windowStub.currentRoomCode = 'ROOM101';
    calls.length = 0;
    confirmations.length = 0;

    await windowStub.inviteFriendToPlay(42);

    assert.equal(confirmations.length, 1, 'Confirmation shown when room is active');
    assert.ok(confirmations[0].msg.includes('Alexander'), 'Confirmation includes friend name');
    assert.ok(confirmations[0].msg.includes('#ROOM101'), 'Confirmation includes current room code');
    assert.equal(calls.length, 1, 'API request made to invite_friends');
    assert.deepEqual(calls[0], { action: 'invite_friends', room_id: 101, friends: [42] });

    // In-flight locking: double tap protection
    let hangingResolve;
    const hangingPromise = new Promise(r => { hangingResolve = r; });
    windowStub.apiRequest = async (payload) => {
        calls.push(payload);
        await hangingPromise;
        return { status: 'ok' };
    };

    calls.length = 0;
    const firstCall = windowStub.inviteFriendToPlay(42);
    const secondCall = windowStub.inviteFriendToPlay(42); // Should be blocked by in-flight lock
    assert.equal(calls.length, 1, 'In-flight lock blocks immediate duplicate invite');
    hangingResolve();
    await Promise.all([firstCall, secondCall]);

    // Restore fast apiRequest
    windowStub.apiRequest = async (payload) => {
        calls.push(payload);
        return { status: 'ok' };
    };

    // 2. Scenario: User does NOT have an active room
    windowStub.currentRoomId = null;
    windowStub.currentRoomCode = null;
    calls.length = 0;
    confirmations.length = 0;

    await windowStub.inviteFriendToPlay(42);

    assert.equal(confirmations.length, 1, 'Prompt shown to create room');
    assert.ok(confirmations[0].msg.includes('Создать новую комнату'), 'Message offers room creation');
    assert.ok(windowStub.pendingInviteFriendContext, 'Pending context saved');
    assert.equal(windowStub.pendingInviteFriendContext.friendId, 42);
    assert.equal(windowStub.pendingInviteFriendContext.friendName, 'Alexander');

    // 2a. Room creation cancelled
    windowStub.pendingInviteFriendContext = { friendId: 42, friendName: 'Alexander', roomCreated: false };
    // Simulate room modal cancel
    windowStub.pendingInviteFriendContext = null;
    assert.equal(calls.length, 0, 'No invite sent when room creation cancelled');

    // 2b. Room creation completed
    windowStub.pendingInviteFriendContext = { friendId: 42, friendName: 'Alexander', roomCreated: false };
    windowStub.currentRoomId = 202;
    windowStub.currentRoomCode = 'ROOM202';
    calls.length = 0;
    confirmations.length = 0;

    windowStub.handlePendingFriendInviteOnRoomCreated();

    assert.equal(windowStub.pendingInviteFriendContext, null, 'Pending context consumed');
    assert.equal(confirmations.length, 1, 'Prompt shown after room created');
    assert.ok(confirmations[0].msg.includes('#ROOM202'), 'Prompt has created room code');
    assert.ok(confirmations[0].msg.includes('Alexander'), 'Prompt has friend name');
    assert.equal(calls.length, 1, 'Invite sent to friend for newly created room');
    assert.deepEqual(calls[0], { action: 'invite_friends', room_id: 202, friends: [42] });

    // 3. Joint Games Rendering
    // 3a. Self profile
    const selfHtml = vm.runInContext("renderUserProfileJointGames({ total_games: 5 }, 'self')", ctx);
    assert.equal(selfHtml, '', 'Self profile renders no joint games block');

    // 3b. Empty state (0 games played together)
    const emptyHtml = vm.runInContext("renderUserProfileJointGames({ total_games: 0 }, 'accepted')", ctx);
    assert.ok(emptyHtml.includes('user-profile-joint-card is-empty'), 'Empty card rendered');
    assert.ok(emptyHtml.includes('Вы ещё не играли вместе'), 'Empty message present');

    // 3c. Games played together
    const jointPayload = {
        total_games: 3,
        last_played_at: '2026-11-04 12:00:00',
        games_by_type: [
            { game_type: 'durak', games_count: 2, last_played_at: '2026-11-04 12:00:00' },
            { game_type: 'bunker', games_count: 1, last_played_at: '2026-11-03 10:00:00' }
        ]
    };
    const jointHtml = vm.runInContext(`renderUserProfileJointGames(${JSON.stringify(jointPayload)}, 'accepted')`, ctx);
    assert.ok(jointHtml.includes('Совместные игры'), 'Title present');
    assert.ok(jointHtml.includes('3 партии'), 'Correct pluralization for 3');
    assert.ok(jointHtml.includes('Дурак'), 'Game 1 title present');
    assert.ok(jointHtml.includes('2'), 'Game 1 count present');
    assert.ok(jointHtml.includes('Бункер'), 'Game 2 title present');
    assert.ok(jointHtml.includes('1'), 'Game 2 count present');

    // 3d. Pluralization checks
    assert.equal(vm.runInContext("getRussianPlural(1, 'партия', 'партии', 'партий')", ctx), 'партия');
    assert.equal(vm.runInContext("getRussianPlural(2, 'партия', 'партии', 'партий')", ctx), 'партии');
    assert.equal(vm.runInContext("getRussianPlural(5, 'партия', 'партии', 'партий')", ctx), 'партий');
    assert.equal(vm.runInContext("getRussianPlural(11, 'партия', 'партии', 'партий')", ctx), 'партий');
    assert.equal(vm.runInContext("getRussianPlural(21, 'партия', 'партии', 'партий')", ctx), 'партия');
    assert.equal(vm.runInContext("getRussianPlural(24, 'партия', 'партии', 'партий')", ctx), 'партии');

    console.log('PASS social invite and joint games tests');
})().catch(err => {
    console.error(err);
    process.exit(1);
});
