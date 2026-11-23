
import { Component, Input, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationsService } from '../../../core/services/notifications.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css'
})
export class SidebarComponent implements OnInit {
  @Input() activePage: string = 'dashboard';
  isOpen = signal(false);

  constructor(
    public auth: AuthService,
    public notificationCount: NotificationsService
  ) {}

  ngOnInit(): void {
    // تحميل عدد الإشعارات مباشرة عند ظهور Sidebar
    void this.notificationCount.refresh();
  }

  toggle(): void {
    this.isOpen.update(value => !value);
  }

  close(): void {
    this.isOpen.set(false);
  }

  async logout(): Promise<void> {
    await this.auth.logout();
  }
}
