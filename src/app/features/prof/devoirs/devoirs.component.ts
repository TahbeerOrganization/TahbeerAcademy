import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { SupabaseService } from '../../../core/services/supabase.service';
import { SidebarComponent } from '../sidebar/sidebar.component';

export interface Groupe {
  id: string | number;
  nom: string;
}

export interface MeetSlot {
  groupeId: string;
  date: string;
  time: string;
}

export interface PdfUpload {
  fichier_url: string;
  nom: string;
  groupeIds: string[];
}

export interface PdfCard {
  fichier_url: string;
  nom: string;
  groupes: string[];
}

export interface MeetCard {
  groupe_id: string | number;
  date_heure: string;
  meet_link: string;
  groupe_nom: string;
}

type ActiveView = 'home' | 'meet' | 'pdf';

@Component({
  selector: 'app-devoirs',
  standalone: true,
  imports: [CommonModule, SidebarComponent],
  templateUrl: './devoirs.component.html',
  styleUrl: './devoirs.component.css'
})
export class DevoirsComponent implements OnInit {

  constructor(private sb: SupabaseService) {}

  // Navigation
  activeView = signal<ActiveView>('home');

  goTo(view: ActiveView): void {
    this.activeView.set(view);
    this.clearMessages();
  }

  goHome(): void {
    this.goTo('home');
  }

  private clearMessages(): void {
    this.errorMsg.set('');
    this.successMsg.set('');
  }

  // Groups
  groupes = signal<Groupe[]>([]);
  loading = signal(false);

  // Google Meet URL
  meetUrl = signal('');
  savingMeetUrl = signal(false);

  // Lock editing after loading/saving a URL
  editingMeetUrl = signal(false);

  toggleEditMeetUrl(): void {
    this.editingMeetUrl.update(value => !value);
    this.clearMessages();
  }

  // Meeting schedules
  meetSlots = signal<MeetSlot[]>([
    { groupeId: '', date: '', time: '' }
  ]);

  meetSessions = signal<MeetCard[]>([]);
  loadingMeetSessions = signal(false);

  // PDF uploads waiting for group assignment
  pdfUploads = signal<PdfUpload[]>([]);
  uploadingFichier = signal(false);

  // PDFs already saved in Supabase
  coursesPdf = signal<PdfCard[]>([]);

  // General form state
  saving = signal(false);
  errorMsg = signal('');
  successMsg = signal('');

  ngOnInit(): void {
    void this.loadAll();
    void this.loadMeetUrl();
    void this.loadFichiers();
    void this.loadMeetSessions();
  }

  // ==================================================
  // LOAD GROUPS
  // ==================================================

  async loadAll(): Promise<void> {
    this.loading.set(true);

    try {
      const { data, error } = await this.sb.client
        .from('groupes')
        .select('id, nom')
        .order('nom');

      if (error) {
        console.error('GROUPES ERROR:', error);
        this.errorMsg.set('تعذر تحميل المجموعات');
        return;
      }

      this.groupes.set((data ?? []) as Groupe[]);
    } catch (error) {
      console.error('GROUPES ERROR:', error);
      this.errorMsg.set('وقع خطأ أثناء تحميل المجموعات');
    } finally {
      this.loading.set(false);
    }
  }

  // ==================================================
  // PERSISTENT GOOGLE MEET URL
  // ==================================================

  updateMeetUrl(value: string): void {
    this.meetUrl.set(value);
  }

  async loadMeetUrl(): Promise<void> {
    try {
      const { data, error } = await this.sb.client
        .from('cours_settings')
        .select('meet_url')
        .eq('id', 1)
        .maybeSingle();

      if (error) {
        console.error('LOAD MEET URL ERROR:', error);
        this.errorMsg.set('تعذر تحميل رابط Meet المحفوظ');
        return;
      }

      const url = data?.meet_url ?? '';

      this.meetUrl.set(url);

      // If a URL already exists, show it in locked mode.
      this.editingMeetUrl.set(!url.trim());
    } catch (error) {
      console.error('LOAD MEET URL ERROR:', error);
      this.errorMsg.set('وقع خطأ أثناء تحميل رابط Meet');
    }
  }

  async enregistrerMeetUrl(): Promise<void> {
    if (this.savingMeetUrl()) {
      return;
    }

    this.clearMessages();

    const url = this.meetUrl().trim();

    if (!url) {
      this.errorMsg.set('المرجو إدخال رابط Google Meet');
      return;
    }

    try {
      const parsedUrl = new URL(url);

      if (
        parsedUrl.protocol !== 'https:' ||
        parsedUrl.hostname !== 'meet.google.com'
      ) {
        this.errorMsg.set(
          'المرجو إدخال رابط Google Meet صحيح'
        );
        return;
      }
    } catch {
      this.errorMsg.set('رابط Google Meet غير صالح');
      return;
    }

    this.savingMeetUrl.set(true);

    try {
      const { error } = await this.sb.client
        .from('cours_settings')
        .upsert({
          id: 1,
          meet_url: url,
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error('SAVE MEET URL ERROR:', error);
        this.errorMsg.set('فشل حفظ رابط Meet');
        return;
      }

      this.meetUrl.set(url);
      this.successMsg.set('تم حفظ رابط Meet بنجاح');

      // Lock the input after a successful save.
      this.editingMeetUrl.set(false);
    } catch (error) {
      console.error('SAVE MEET URL ERROR:', error);
      this.errorMsg.set('وقع خطأ أثناء حفظ الرابط');
    } finally {
      this.savingMeetUrl.set(false);
    }
  }

  // ==================================================
  // MEETING SCHEDULES
  // ==================================================

  addMeetSlot(): void {
    this.meetSlots.update(slots => [
      ...slots,
      { groupeId: '', date: '', time: '' }
    ]);
  }

  removeMeetSlot(index: number): void {
    this.meetSlots.update(slots =>
      slots.filter((_, i) => i !== index)
    );
  }

  updateMeetSlot(
    index: number,
    field: keyof MeetSlot,
    value: string
  ): void {
    this.meetSlots.update(slots =>
      slots.map((slot, i) =>
        i === index
          ? { ...slot, [field]: value }
          : slot
      )
    );
  }

  async validerMeet(): Promise<void> {
    if (this.saving() || this.savingMeetUrl()) {
      return;
    }

    this.clearMessages();

    const link = this.meetUrl().trim();

    if (!link) {
      this.errorMsg.set('خاصك تحفظ رابط Meet أولا');
      return;
    }

    const slots = this.meetSlots();

    if (slots.length === 0) {
      this.errorMsg.set('المرجو إضافة حصة واحدة على الأقل');
      return;
    }

    if (slots.some(slot => !slot.groupeId)) {
      this.errorMsg.set(
        'المرجو اختيار المجموعة لكل حصة'
      );
      return;
    }

    const ids = slots.map(slot => slot.groupeId);

    if (new Set(ids).size !== ids.length) {
      this.errorMsg.set(
        'كل مجموعة خاصها تكون مسجلة مرة واحدة فقط'
      );
      return;
    }

    if (slots.some(slot => !slot.date || !slot.time)) {
      this.errorMsg.set(
        'المرجو تحديد تاريخ ووقت كل حصة'
      );
      return;
    }

    this.saving.set(true);

    try {
      const rows = slots.map(slot => ({
        groupe_id: slot.groupeId,
        date_heure: `${slot.date}T${slot.time}:00`,
        meet_link: link,
        fichier_url: null
      }));

      const { error } = await this.sb.client
        .from('cours')
        .insert(rows);

      if (error) {
        console.error('MEET SCHEDULE ERROR:', error);
        this.errorMsg.set(
          'فشل حفظ المواعيد. تأكد من بنية جدول cours وصلاحيات Supabase.'
        );
        return;
      }

      this.successMsg.set('تم حفظ مواعيد الحصص بنجاح');

      this.meetSlots.set([
        { groupeId: '', date: '', time: '' }
      ]);

      await this.loadMeetSessions();
    } catch (error) {
      console.error('MEET SCHEDULE ERROR:', error);
      this.errorMsg.set('وقع خطأ أثناء حفظ المواعيد');
    } finally {
      this.saving.set(false);
    }
  }

  async loadMeetSessions(): Promise<void> {
    this.loadingMeetSessions.set(true);

    try {
      const { data, error } = await this.sb.client
        .from('cours')
        .select('groupe_id, date_heure, meet_link, groupes(nom)')
        .not('meet_link', 'is', null)
        .not('date_heure', 'is', null)
        .order('date_heure', { ascending: true });

      if (error) {
        console.error('MEET SESSIONS ERROR:', error);
        this.errorMsg.set('تعذر تحميل حصص Google Meet');
        return;
      }

      const sessions: MeetCard[] = (data ?? []).map(row => {
        const relation = row.groupes as
          | { nom?: string }
          | { nom?: string }[]
          | null;

        const groupe = Array.isArray(relation)
          ? relation[0]
          : relation;

        return {
          groupe_id: row.groupe_id,
          date_heure: row.date_heure,
          meet_link: row.meet_link,
          groupe_nom: groupe?.nom ?? 'مجموعة غير معروفة'
        };
      });

      this.meetSessions.set(sessions);
    } catch (error) {
      console.error('MEET SESSIONS ERROR:', error);
      this.errorMsg.set('وقع خطأ أثناء تحميل الحصص');
    } finally {
      this.loadingMeetSessions.set(false);
    }
  }

  // ==================================================
  // PDF GROUP SELECTION
  // ==================================================

  togglePdfGroup(
    pdfIndex: number,
    groupeId: string
  ): void {
    this.pdfUploads.update(list =>
      list.map((pdf, i) => {
        if (i !== pdfIndex) {
          return pdf;
        }

        const selected = pdf.groupeIds.includes(groupeId);

        return {
          ...pdf,
          groupeIds: selected
            ? pdf.groupeIds.filter(id => id !== groupeId)
            : [...pdf.groupeIds, groupeId]
        };
      })
    );
  }

  isPdfGroupSelected(
    pdfIndex: number,
    groupeId: string
  ): boolean {
    return this.pdfUploads()[pdfIndex]?.groupeIds.includes(groupeId)
      ?? false;
  }

  removePdf(index: number): void {
    this.pdfUploads.update(list =>
      list.filter((_, i) => i !== index)
    );
  }

  // ==================================================
  // UPLOAD PDF TO SUPABASE STORAGE
  // ==================================================

  async onFichierSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    this.clearMessages();

    if (
      file.type !== 'application/pdf' ||
      !file.name.toLowerCase().endsWith('.pdf')
    ) {
      this.errorMsg.set('يجب اختيار ملف PDF فقط');
      input.value = '';
      return;
    }

    this.uploadingFichier.set(true);

    try {
      const fileName = `${crypto.randomUUID()}.pdf`;

      const { error } = await this.sb.client.storage
        .from('devoirs-fichiers')
        .upload(fileName, file, {
          contentType: 'application/pdf',
          upsert: false
        });

      if (error) {
        console.error('UPLOAD ERROR:', error);
        this.errorMsg.set('فشل رفع الملف: ' + error.message);
        return;
      }

      const { data } = this.sb.client.storage
        .from('devoirs-fichiers')
        .getPublicUrl(fileName);

      this.pdfUploads.update(list => [
        ...list,
        {
          fichier_url: data.publicUrl,
          nom: file.name,
          groupeIds: []
        }
      ]);

      this.successMsg.set(
        'تم رفع الملف. اختار المجموعات اللي غادي تستافد منو.'
      );
    } catch (error) {
      console.error('UPLOAD ERROR:', error);
      this.errorMsg.set('وقع خطأ أثناء رفع ملف PDF');
    } finally {
      this.uploadingFichier.set(false);
      input.value = '';
    }
  }

  // ==================================================
  // SAVE PDF ASSIGNMENTS
  // ==================================================

  
async validerPdf(): Promise<void> {
  if (this.saving() || this.uploadingFichier()) {
    return;
  }

  this.clearMessages();

  const uploads = this.pdfUploads();

  // التحقق من وجود الملفات
  if (uploads.length === 0) {
    this.errorMsg.set('المرجو إضافة ملف PDF واحد على الأقل');
    return;
  }

  // التحقق من اختيار مجموعة لكل ملف
  if (uploads.some(pdf => pdf.groupeIds.length === 0)) {
    this.errorMsg.set(
      'المرجو اختيار مجموعة واحدة على الأقل لكل ملف'
    );
    return;
  }

  this.saving.set(true);

  try {
    // تجهيز البيانات للحفظ في جدول cours
    const rows = uploads.flatMap(pdf =>
      pdf.groupeIds.map(groupeId => ({
        groupe_id: groupeId,
        fichier_url: pdf.fichier_url,
        fichier_nom: pdf.nom,
        date_heure: null,
        meet_link: null
      }))
    );

    // حفظ الملفات في قاعدة البيانات
    const { error } = await this.sb.client
      .from('cours')
      .insert(rows);

    if (error) {
      console.error('PDF SAVE ERROR:', error);
      console.error('PDF SAVE ERROR MESSAGE:', error.message);
      console.error('PDF SAVE ERROR CODE:', error.code);
      console.error('PDF SAVE ERROR DETAILS:', error.details);
      console.error('PDF SAVE ERROR HINT:', error.hint);

      this.errorMsg.set(
        `فشل حفظ الملفات: ${error.message}`
      );

      return;
    }

    // نجاح الحفظ
    this.successMsg.set('تم حفظ ملفات PDF بنجاح');

    // تفريغ الملفات التي تم حفظها
    this.pdfUploads.set([]);

    // تحديث لائحة الملفات المحفوظة
    await this.loadFichiers();

  } catch (error) {
    console.error('PDF SAVE ERROR:', error);

    this.errorMsg.set(
      'وقع خطأ غير متوقع أثناء حفظ ملفات PDF'
    );

  } finally {
    this.saving.set(false);
  }
}

  // ==================================================
  // LOAD SAVED PDFS
  // ==================================================

  async loadFichiers(): Promise<void> {
    try {
      const { data, error } = await this.sb.client
        .from('cours')
        .select('fichier_url, fichier_nom, groupe_id, groupes(nom)')
        .not('fichier_url', 'is', null);

      if (error) {
        console.error('FICHIERS ERROR:', error);
        this.errorMsg.set('تعذر تحميل ملفات PDF');
        return;
      }

      const map = new Map<
        string,
        { nom: string; groupes: Set<string> }
      >();

      for (const row of data ?? []) {
        const url = row.fichier_url as string | null;

        if (!url) {
          continue;
        }

        const nomOriginal = row.fichier_nom as string | null;
        const nomUrl =
          url.split('/').pop()?.split('?')[0] ?? 'fichier.pdf';

        if (!map.has(url)) {
          map.set(url, {
            nom: nomOriginal?.trim() || nomUrl,
            groupes: new Set<string>()
          });
        }

        const relation = row.groupes as
          | { nom?: string }
          | { nom?: string }[]
          | null;

        const groupe = Array.isArray(relation)
          ? relation[0]
          : relation;

        if (groupe?.nom) {
          map.get(url)!.groupes.add(groupe.nom);
        }
      }

      this.coursesPdf.set(
        Array.from(map.entries()).map(([fichier_url, info]) => ({
          fichier_url,
          nom: info.nom,
          groupes: Array.from(info.groupes)
        }))
      );
    } catch (error) {
      console.error('FICHIERS ERROR:', error);
      this.errorMsg.set('وقع خطأ أثناء تحميل ملفات PDF');
    }
  }
}