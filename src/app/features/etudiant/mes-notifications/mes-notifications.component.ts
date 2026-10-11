import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

import { SupabaseService } from '../../../core/services/supabase.service';
import { SidebarComponent } from '../sidebar/sidebar.component';

interface PaymentNotification {
  id: number;
  title: string;
  message: string;
  is_read: boolean;
  dismissed_at: string | null;
  created_at: string;
}

@Component({
  selector: 'app-mes-notifications',
  standalone: true,
  imports: [CommonModule, SidebarComponent],
  templateUrl: './mes-notifications.component.html',
  styleUrl: './mes-notifications.component.css'
})
export class MesNotificationsComponent implements OnInit {
  constructor(private sb: SupabaseService) {}

  notifications: PaymentNotification[] = [];
  loading = false;
  errorMsg = '';
  successMsg = '';

  get visibleNotifications(): PaymentNotification[] {
    return this.notifications.filter(n => !n.dismissed_at);
  }

  ngOnInit(): void {
    void this.loadNotifications();
  }

  async loadNotifications(): Promise<void> {
    this.loading = true;
    this.errorMsg = '';

    try {
      const { data, error } = await this.sb.client
        .from('notifications')
        .select('id, title, message, is_read, dismissed_at, created_at')
        .eq('type', 'payment')
        .is('dismissed_at', null)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('NOTIFICATIONS ERROR:', error);
        this.errorMsg = 'تعذر تحميل الإشعارات';
        return;
      }

      this.notifications = (data ?? []) as PaymentNotification[];
    } catch (error) {
      console.error('NOTIFICATIONS ERROR:', error);
      this.errorMsg = 'وقع خطأ أثناء تحميل الإشعارات';
    } finally {
      this.loading = false;
    }
  }

  async dismissPayment(notification: PaymentNotification): Promise<void> {
    const { error } = await this.sb.client
      .from('notifications')
      .update({
        is_read: true,
        dismissed_at: new Date().toISOString()
      })
      .eq('id', notification.id);

    if (error) {
      console.error('DISMISS PAYMENT ERROR:', error);
      this.errorMsg = 'تعذر تحديث الإشعار';
      return;
    }

    this.notifications = this.notifications.filter(
      n => n.id !== notification.id
    );
  }
}