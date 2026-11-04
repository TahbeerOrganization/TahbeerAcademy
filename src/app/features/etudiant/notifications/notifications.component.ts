
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

import { SupabaseService } from '../../../core/services/supabase.service';
import { SidebarComponent } from '../sidebar/sidebar.component';

type NotificationType = 'payment' | 'announcement';

interface AppNotification {
  id: number | string;
  type: NotificationType;
  title: string;
  message: string;
  user_id: string;
  is_read: boolean;
  dismissed_at: string | null;
  created_at: string;
  read_at: string | null;
  isNew: boolean;
}

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule, SidebarComponent],
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.css'
})
export class MesNotificationsComponent implements OnInit {

  constructor(private sb: SupabaseService) {}

  notifications: AppNotification[] = [];

  loading = false;
  errorMsg = '';
  successMsg = '';

  markingReadId: number | string | null = null;
  dismissingId: number | string | null = null;

  get visibleNotifications(): AppNotification[] {
    return this.notifications.filter(
      n => n.type === 'announcement' || !n.dismissed_at
    );
  }

  get unreadCount(): number {
    return this.notifications.filter(
      n => n.type === 'announcement' && !n.is_read
    ).length;
  }

  get annoncesCount(): number {
    return this.notifications.filter(
      n => n.type === 'announcement'
    ).length;
  }

  get paymentsCount(): number {
    return this.notifications.filter(
      n => n.type === 'payment' && !n.dismissed_at
    ).length;
  }

  ngOnInit(): void {
    void this.loadNotifications();
  }

  // تحميل إشعارات الطالب المسجل دخوله فقط
  async loadNotifications(): Promise<void> {
    this.loading = true;
    this.errorMsg = '';
    this.successMsg = '';

    try {
      const { data: authData, error: authError } =
        await this.sb.client.auth.getUser();

      if (authError || !authData.user) {
        this.errorMsg = 'خاصك تسجل الدخول من جديد';
        return;
      }

      const userId = authData.user.id;

      const { data, error } = await this.sb.client
        .from('notifications')
        .select(`
          id,
          user_id,
          type,
          title,
          message,
          is_read,
          dismissed_at,
          read_at,
          created_at
        `)
        .eq('user_id', userId)
        .in('type', ['payment', 'announcement'])
        .order('created_at', { ascending: false });

      if (error) {
        console.error('LOAD NOTIFICATIONS ERROR:', error);
        this.errorMsg = 'تعذر تحميل الإشعارات';
        return;
      }

      this.notifications = (data ?? []).map((n: any) => ({
        ...n,
        is_read: !!n.is_read,
        isNew: !n.is_read
      })) as AppNotification[];

    } catch (error) {
      console.error('NOTIFICATIONS ERROR:', error);
      this.errorMsg = 'وقع خطأ أثناء تحميل الإشعارات';
    } finally {
      this.loading = false;
    }
  }

  // الطالب كيأكد أنه قرأ رسالة الأستاذ
  async markAsRead(notification: AppNotification): Promise<void> {

    if (
      notification.type !== 'announcement' ||
      notification.is_read ||
      this.markingReadId !== null
    ) {
      return;
    }

    this.errorMsg = '';
    this.successMsg = '';
    this.markingReadId = notification.id;

    try {
      const { data: authData, error: authError } =
        await this.sb.client.auth.getUser();

      if (authError || !authData.user) {
        this.errorMsg = 'خاصك تسجل الدخول من جديد';
        return;
      }

      const userId = authData.user.id;
      const now = new Date().toISOString();

      const { data, error } = await this.sb.client
        .from('notifications')
        .update({
          is_read: true,
          read_at: now
        })
        .eq('id', notification.id)
        .eq('user_id', userId)
        .select('id, is_read, read_at')
        .maybeSingle();

      if (error) {
        console.error('MARK AS READ ERROR:', error);
        this.errorMsg = 'تعذر تسجيل قراءة الرسالة. تحقق من صلاحيات Supabase.';
        return;
      }

      if (!data) {
        console.error('No notification row was updated');
        this.errorMsg = 'لم يتم تحديث الإشعار. تحقق من صلاحيات RLS في Supabase.';
        return;
      }

      // تحديث الواجهة بعد نجاح التحديث في قاعدة البيانات
      this.notifications = this.notifications.map(n =>
        n.id === notification.id
          ? {
              ...n,
              is_read: true,
              isNew: false,
              read_at: data.read_at
            }
          : n
      );

      this.successMsg = 'تم تسجيل قراءة الرسالة بنجاح';

    } catch (error) {
      console.error('MARK AS READ ERROR:', error);
      this.errorMsg = 'وقع خطأ أثناء تحديث الإشعار';
    } finally {
      this.markingReadId = null;
    }
  }

  // إخفاء تذكير الأداء بعد الضغط على خلصت
  async dismissPayment(notification: AppNotification): Promise<void> {

    if (
      notification.type !== 'payment' ||
      this.dismissingId !== null
    ) {
      return;
    }

    this.errorMsg = '';
    this.successMsg = '';
    this.dismissingId = notification.id;

    try {
      const { data: authData, error: authError } =
        await this.sb.client.auth.getUser();

      if (authError || !authData.user) {
        this.errorMsg = 'خاصك تسجل الدخول من جديد';
        return;
      }

      const { error } = await this.sb.client
        .from('notifications')
        .update({
          is_read: true,
          dismissed_at: new Date().toISOString()
        })
        .eq('id', notification.id)
        .eq('user_id', authData.user.id);

      if (error) {
        console.error('DISMISS PAYMENT ERROR:', error);
        this.errorMsg = 'تعذر تحديث الإشعار';
        return;
      }

      this.notifications = this.notifications.filter(
        n => n.id !== notification.id
      );

      this.successMsg = 'تم تحديث الإشعار بنجاح';

    } catch (error) {
      console.error('DISMISS PAYMENT ERROR:', error);
      this.errorMsg = 'وقع خطأ أثناء تحديث الإشعار';
    } finally {
      this.dismissingId = null;
    }
  }
}
