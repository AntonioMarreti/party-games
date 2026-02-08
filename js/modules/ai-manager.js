/**
 * AI Manager
 * Handles interactions with GigaChat via our backend
 */
const AIManager = {
    async generate(type, data = {}) {
        return window.apiRequest({
            action: 'generate_content',
            type: type,
            data: JSON.stringify(data)
        });
    },

    async generateQuizQuestion(topic) {
        return this.generate('quiz_question', { topic });
    },

    async generateBunkerCharacter() {
        return this.generate('bunker_character');
    },

    async getWordHint(word) {
        return this.generate('word_hint', { word });
    },

    async generateImage(prompt) {
        return this.generate('generate_image', { prompt });
    }
};

window.AIManager = AIManager;
