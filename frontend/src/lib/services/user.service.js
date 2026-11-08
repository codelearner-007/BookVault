import { apiClient } from './api-client';

export const userService = {
  async getProfile() {
    return apiClient.get('/v1/profile');
  },

  async updateProfile(data) {
    return apiClient.patch('/v1/profile', data);
  },
};
