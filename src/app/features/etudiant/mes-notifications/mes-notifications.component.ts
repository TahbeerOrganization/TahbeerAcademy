
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

import { SupabaseService } from '../../../core/services/supabase.service';
import { SidebarComponent } from '../sidebar/sidebar.component';

interface PaymentNotification {
  id: string;
  titre: string;
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

  get unreadCount(): number {
    return this.visibleNotifications.filter(n => !n.is_read).length;
  }

  ngOnInit(): void {
    void this.loadNotifications();
  }

  async loadNotifications(): Promise<void> {
    this.loading = true;
    this.errorMsg = '';

    try {
      // جلب المستخدم المسجل دخوله
      const { data: { user }, error: authError } =
        await this.sb.client.auth.getUser();

      if (authError || !user) {
        this.errorMsg = 'خاصك تسجل الدخول أولاً';
        this.notifications = [];
        return;
      }

      console.log('Authenticated user ID:', user.id);

      // جلب إشعارات هاد الطالب فقط
      const { data, error } = await this.sb.client
        .from('notifications')
        .select('id, user_id, titre, message, is_read, dismissed_at, created_at')
        .eq('user_id', user.id)
        .eq('type', 'payment')
        .is('dismissed_at', null)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('NOTIFICATIONS ERROR:', error);
        this.errorMsg = 'تعذر تحميل الإشعارات: ' + error.message;
        return;
      }

      this.notifications = (data ?? []) as PaymentNotification[];

    } catch (error: any) {
      console.error(error);
      this.errorMsg = 'وقع خطأ أثناء تحميل الإشعارات';
    } finally {
      this.loading = false;
    }
  }

  async dismissPayment(notification: PaymentNotification): Promise<void> {

    this.errorMsg = '';
    this.successMsg = '';

    const { data, error } = await this.sb.client
      .from('notifications')
      .update({
        is_read: true,
        dismissed_at: new Date().toISOString()
      })
      .eq('id', notification.id)
      .select('id');

    if (error) {
      console.error('DISMISS PAYMENT ERROR:', error);
      this.errorMsg = 'تعذر تحديث الإشعار: ' + error.message;
      return;
    }

    if (!data || data.length === 0) {
      this.errorMsg = 'لم يتم تحديث الإشعار. تحقق من صلاحيات RLS.';
      return;
    }

    this.notifications = this.notifications.filter(
      n => n.id !== notification.id
    );

    this.successMsg = 'تم تأكيد أداء الواجب بنجاح';
  }

}
