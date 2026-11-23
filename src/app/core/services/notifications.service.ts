import { Injectable,signal } from '@angular/core';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root'
})
export class NotificationsService {

 unreadCount = signal(0);

  constructor(private sb: SupabaseService) {}

  async refresh(): Promise<void> {
    const { data: authData, error: authError } =
      await this.sb.client.auth.getUser();

    if (authError || !authData.user) {
      this.unreadCount.set(0);
      return;
    }

    const { count, error } = await this.sb.client
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', authData.user.id)
      .eq('type', 'announcement')
      .eq('is_read', false);

    if (error) {
      console.error('UNREAD COUNT ERROR:', error);
      return;
    }

    this.unreadCount.set(count ?? 0);
  }}
