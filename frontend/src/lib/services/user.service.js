import { apiClient } from './api-client';

export const userService = {
  async getProfile() {
    return apiClient.get('/v1/profile');
  },

  async updateProfile(data) {
    return apiClient.patch('/v1/profile', data);
  },

  async changePassword(data) {
    return apiClient.post('/auth/change-password', data);
  },
};
