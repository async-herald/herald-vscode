import * as vscode from 'vscode';
import { HERALD_CONFIG } from './config';

export class HeraldAuthService {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  async saveToken(token: string): Promise<void> {
    await this.context.secrets.store(HERALD_CONFIG.TOKEN_KEY, token);
  }

  async getToken(): Promise<string | undefined> {
    return await this.context.secrets.get(HERALD_CONFIG.TOKEN_KEY);
  }

  async clearToken(): Promise<void> {
    await this.context.secrets.delete(HERALD_CONFIG.TOKEN_KEY);
  }

  async isAuthenticated(): Promise<boolean> {
    const token = await this.getToken();
    return !!token && token.startsWith('herald_');
  }

  async getUserInfo(): Promise<{ email: string } | null> {
    const token = await this.getToken();
    if (!token) {
      return null;
    }

    try {
      const response = await fetch(`${HERALD_CONFIG.API_URL}/herald/tokens/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return data as { email: string };
    } catch (error) {
      console.error('Error fetching user info:', error);
      return null;
    }
  }
}
