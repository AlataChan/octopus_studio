import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

const Office = {
  async getLayout() {
    return fetch(`${API_BASE}/office/layout`, {
      headers: baseHeaders(),
    })
      .then((response) => response.json())
      .catch((error) => {
        console.error("Failed to fetch office layout:", error);
        return null;
      });
  },

  sseUrl() {
    return `${API_BASE}/office/events`;
  },
};

export default Office;
