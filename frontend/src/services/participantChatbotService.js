import { API } from '../api/api';
import { fetchWithTimeout } from '../api/request';

/**
 * Participant Chatbot Service
 * ────────────────────────────
 * Communicates with the Participant AI Assistant endpoint.
 */
export const participantChatbotService = {
  /**
   * Ask the AI Assistant a question.
   *
   * @param {Object} params
   * @param {string} params.message - Learner's query text
   * @param {Array} params.history - Previous chat messages
   * @param {Object} params.context - Current route / tab context
   */
  async askAssistant({ message, history = [], context = {} }) {
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;
    const token = user?.token || '';

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    const payload = {
      message,
      history,
      context,
    };

    try {
      const response = await fetchWithTimeout(
        API.PARTICIPANT.CHATBOT_ASK,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        },
        25000
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to get response from assistant');
      }

      return await response.json();
    } catch (err) {
      console.warn('Chatbot assistant request error:', err.message);
      throw err;
    }
  },
};
