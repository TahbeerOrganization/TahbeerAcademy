
import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { SupabaseService } from '../../../core/services/supabase.service';
import { SidebarComponent } from '../../prof/sidebar/sidebar.component';

interface Groupe {
  id: string;
  nom: string;
}

interface AnnonceRow {
  id: string;
  title: string;
  message: string;
  cible: 'all' | 'groupes';
  groupe_ids: string[];
  created_at: string;
  total: number;
  lus: number;
}

interface Recipient {
  id: string;
  nom: string;
  is_read: boolean;
  read_at: string | null;
}

type FiltreSuivi = 'all' | 'lus' | 'non_lus';

@Component({
  selector: 'app-announcements',
  standalone: true,
  imports: [CommonModule, SidebarComponent],
  templateUrl: './announcements.component.html',
  styleUrl: './announcements.component.css'
})
export class AnnouncementsComponent implements OnInit {

  constructor(private sb: SupabaseService) {}

  readonly MAX_TITLE = 120;
  readonly MAX_MESSAGE = 1000;

  // ---------- FORMULAIRE ----------

  titre = signal('');
  message = signal('');
  cible = signal<'all' | 'groupes'>('all');
  selectedGroupes = signal<string[]>([]);

  groupes = signal<Groupe[]>([]);
  annonces = signal<AnnonceRow[]>([]);

  loading = signal(false);
  sending = signal(false);
  deletingId = signal<string | null>(null);

  errorMsg = signal('');
  successMsg = signal('');

  canSend = computed(() =>
    !this.sending() &&
    !!this.titre().trim() &&
    !!this.message().trim() &&
    (
      this.cible() === 'all' ||
      this.selectedGroupes().length > 0
    )
  );

  ngOnInit(): void {
    void this.loadGroupes();
    void this.loadAnnonces();
  }

  // ---------- CHARGEMENT DES GROUPES ----------

  async loadGroupes(): Promise<void> {
    const { data, error } = await this.sb.client
      .from('groupes')
      .select('id, nom')
      .order('nom');

    if (error) {
      console.error('GROUPES ERROR:', error);
      this.errorMsg.set('تعذر تحميل المجموعات');
      return;
    }

    this.groupes.set(
      (data ?? []).map((g: any) => ({
        id: String(g.id),
        nom: String(g.nom)
      }))
    );
  }

  // ---------- CHARGEMENT DES ANNONCES ----------

  async loadAnnonces(): Promise<void> {
    this.loading.set(true);

    try {
      const { data, error } = await this.sb.client
        .from('announcements')
        .select('id, title, message, cible, groupe_ids, created_at')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      const rows = data ?? [];
      const ids = rows.map((a: any) => a.id);

      const stats = new Map<string, {
        total: number;
        lus: number;
      }>();

      if (ids.length > 0) {
        const { data: notifs, error: e2 } = await this.sb.client
          .from('notifications')
          .select('announcement_id, is_read')
          .in('announcement_id', ids);

        if (e2) throw e2;

        for (const n of notifs ?? []) {
          const key = String(n.announcement_id);

          const s = stats.get(key) ?? {
            total: 0,
            lus: 0
          };

          s.total++;

          if (n.is_read) {
            s.lus++;
          }

          stats.set(key, s);
        }
      }

      this.annonces.set(
        rows.map((a: any) => ({
          id: String(a.id),
          title: String(a.title),
          message: String(a.message),
          cible: a.cible,
          groupe_ids: (a.groupe_ids ?? []) as string[],
          created_at: String(a.created_at),
          total: stats.get(String(a.id))?.total ?? 0,
          lus: stats.get(String(a.id))?.lus ?? 0
        }))
      );

    } catch (error: any) {
      console.error('ANNONCES ERROR:', error);
      this.errorMsg.set('تعذر تحميل الرسائل المرسلة');

    } finally {
      this.loading.set(false);
    }
  }

  // ---------- FORMULAIRE ----------

  setCible(value: 'all' | 'groupes'): void {
    this.cible.set(value);
  }

  toggleGroupe(id: string): void {
    this.selectedGroupes.update(list =>
      list.includes(id)
        ? list.filter(x => x !== id)
        : [...list, id]
    );
  }

  isGroupeSelected(id: string): boolean {
    return this.selectedGroupes().includes(id);
  }

  private mapError(error: any): string {
    const msg = String(error?.message ?? '');

    if (msg.includes('no_recipients')) {
      return 'لا يوجد طلاب في الاختيار الحالي';
    }

    if (error?.code === '42501') {
      return 'ليست لديك صلاحية إرسال الرسائل';
    }

    return msg || 'تعذر إرسال الرسالة';
  }

  // ---------- ENVOYER UNE ANNONCE ----------

  async envoyer(): Promise<void> {
    if (!this.canSend()) return;

    this.errorMsg.set('');
    this.successMsg.set('');

    const target = this.cible() === 'all'
      ? 'جميع الطلاب'
      : `${this.selectedGroupes().length} مجموعة`;

    if (!window.confirm(
      `واش بغيتي ترسل هاد الرسالة إلى: ${target}؟`
    )) return;

    this.sending.set(true);

    try {
      const { data, error } = await this.sb.client.rpc(
        'send_announcement',
        {
          p_title: this.titre().trim(),
          p_message: this.message().trim(),
          p_groupe_ids: this.cible() === 'all'
            ? null
            : this.selectedGroupes()
        }
      );

      if (error) throw error;

      this.titre.set('');
      this.message.set('');
      this.cible.set('all');
      this.selectedGroupes.set([]);

      this.successMsg.set(
        `تم إرسال الرسالة إلى ${data?.count ?? 0} طالب`
      );

      await this.loadAnnonces();

    } catch (error: any) {
      console.error('SEND ERROR:', error);
      this.errorMsg.set(this.mapError(error));

    } finally {
      this.sending.set(false);
    }
  }

  // ---------- SUPPRIMER UNE ANNONCE ----------

  async supprimer(a: AnnonceRow): Promise<void> {
    if (this.deletingId()) return;

    if (!window.confirm(
      `حذف الرسالة "${a.title}"؟ غادي تتحيد عند جميع الطلاب.`
    )) return;

    this.deletingId.set(a.id);
    this.errorMsg.set('');

    try {
      const { error } = await this.sb.client
        .from('announcements')
        .delete()
        .eq('id', a.id);

      if (error) throw error;

      if (this.selectedAnnonceId() === a.id) {
        this.fermerSuivi();
      }

      this.annonces.update(list =>
        list.filter(x => x.id !== a.id)
      );

      this.successMsg.set('تم حذف الرسالة');

    } catch (error: any) {
      console.error('DELETE ERROR:', error);
      this.errorMsg.set(
        error?.message || 'تعذر حذف الرسالة'
      );

    } finally {
      this.deletingId.set(null);
    }
  }

  // ---------- AFFICHAGE ----------

  extrait(text: string, max = 140): string {
    return text.length > max
      ? text.slice(0, max) + '…'
      : text;
  }

  cibleLabel(a: AnnonceRow): string {
    if (a.cible === 'all') {
      return 'جميع الطلاب';
    }

    return a.groupe_ids
      .map(id =>
        this.groupes().find(g => g.id === id)?.nom ?? '—'
      )
      .join('، ');
  }

  pourcentage(a: AnnonceRow): number {
    return a.total
      ? Math.round((a.lus * 100) / a.total)
      : 0;
  }

  // ---------- POPUP SUIVI DE LECTURE ----------

  selectedAnnonceId = signal<string | null>(null);

  recipients = signal<Recipient[]>([]);

  loadingRecipients = signal(false);

  filtreSuivi = signal<FiltreSuivi>('all');

  selectedAnnonce = computed(() =>
    this.annonces().find(
      a => a.id === this.selectedAnnonceId()
    ) ?? null
  );

  totalRecipients = computed(() =>
    this.recipients().length
  );

  lusCount = computed(() =>
    this.recipients().filter(r => r.is_read).length
  );

  nonLusCount = computed(() =>
    this.totalRecipients() - this.lusCount()
  );

  tauxLecture = computed(() =>
    this.totalRecipients()
      ? Math.round(
          this.lusCount() * 100 / this.totalRecipients()
        )
      : 0
  );

  recipientsFiltres = computed(() => {
    const f = this.filtreSuivi();

    return this.recipients().filter(r =>
      f === 'all' ? true :
      f === 'lus' ? r.is_read :
      !r.is_read
    );
  });

  // Ouvrir le popup
  async ouvrirSuivi(a: AnnonceRow): Promise<void> {
    this.selectedAnnonceId.set(a.id);
    this.filtreSuivi.set('all');
    this.recipients.set([]);

    await this.loadRecipients(a.id);
  }

  // Fermer le popup
  fermerSuivi(): void {
    this.selectedAnnonceId.set(null);
    this.recipients.set([]);
    this.filtreSuivi.set('all');
  }

  // Charger les destinataires de cette annonce uniquement
  async loadRecipients(announcementId: string): Promise<void> {
    this.loadingRecipients.set(true);

    try {
      const { data, error } = await this.sb.client
        .from('notifications')
        .select('user_id, is_read, read_at')
        .eq('announcement_id', announcementId);

      if (error) throw error;

      const rows = data ?? [];

      const userIds = [
        ...new Set(
          rows.map((r: any) => String(r.user_id))
        )
      ];

      const names = new Map<string, string>();

      if (userIds.length > 0) {
        const { data: profiles, error: profileError } =
          await this.sb.client
            .from('profiles')
            .select('id, nom')
            .in('id', userIds);

        if (profileError) throw profileError;

        for (const p of profiles ?? []) {
          names.set(
            String(p.id),
            String(p.nom ?? '')
          );
        }
      }

      // منع عرض نتائج إعلان قديم إذا اختار المستخدم إعلاناً آخر
      if (this.selectedAnnonceId() !== announcementId) {
        return;
      }

      const result: Recipient[] = rows.map((r: any) => ({
        id: String(r.user_id),
        nom: names.get(String(r.user_id)) || 'طالب غير معروف',
        is_read: !!r.is_read,
        read_at: r.read_at ?? null
      }));

      result.sort((a, b) =>
        Number(a.is_read) - Number(b.is_read) ||
        a.nom.localeCompare(b.nom, 'ar')
      );

      this.recipients.set(result);

    } catch (error: any) {
      console.error('RECIPIENTS ERROR:', error);

      this.errorMsg.set(
        'تعذر تحميل تفاصيل القراءة: ' +
        (error?.message ?? '')
      );

    } finally {
      if (this.selectedAnnonceId() === announcementId) {
        this.loadingRecipients.set(false);
      }
    }
  }

  setFiltreSuivi(f: FiltreSuivi): void {
    this.filtreSuivi.set(f);
  }
}
