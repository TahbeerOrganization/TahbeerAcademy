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

  // ==================================================
  // NAVIGATION
  // ==================================================

  activeView = signal<ActiveView>('home');

  goTo(view: ActiveView): void {
    this.activeView.set(view);
    this.clearMessages();

    if (view === 'pdf') {
      void this.loadFichiers();
    }

    if (view === 'meet') {
      void this.loadMeetSessions();
    }
  }

  goHome(): void {
    this.goTo('home');
  }

  private clearMessages(): void {
    this.errorMsg.set('');
    this.successMsg.set('');
  }

  // ==================================================
  // GROUPES
  // ==================================================

  groupes = signal<Groupe[]>([]);
  loading = signal(false);

  // ==================================================
  // MESSAGES ET ETAT GENERAL
  // ==================================================

  saving = signal(false);
  errorMsg = signal('');
  successMsg = signal('');
  deletingItem = signal<string | null>(null);

  // ==================================================
  // GOOGLE MEET URL
  // ==================================================

  meetUrl = signal('');
  savingMeetUrl = signal(false);
  editingMeetUrl = signal(false);

  toggleEditMeetUrl(): void {
    if (this.savingMeetUrl()) {
      return;
    }

    // Si on annule la modification, recharger la valeur sauvegardée.
    if (this.editingMeetUrl()) {
      void this.loadMeetUrl();
    } else {
      this.editingMeetUrl.set(true);
    }

    this.clearMessages();
  }

  updateMeetUrl(value: string): void {
    this.meetUrl.set(value);
  }

  // ==================================================
  // MEETING SESSIONS
  // ==================================================

  meetSlots = signal<MeetSlot[]>([
    { groupeId: '', date: '', time: '' }
  ]);

  meetSessions = signal<MeetCard[]>([]);
  loadingMeetSessions = signal(false);

  meetDeleteKey(session: MeetCard): string {
    return `meet-${session.groupe_id}-${session.date_heure}`;
  }

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
        i === index ? { ...slot, [field]: value } : slot
      )
    );
  }

  // ==================================================
  // PDF UPLOADS
  // ==================================================

  pdfUploads = signal<PdfUpload[]>([]);
  uploadingFichier = signal(false);
  coursesPdf = signal<PdfCard[]>([]);

  // ==================================================
  // INITIALISATION
  // ==================================================

  ngOnInit(): void {
    void this.loadAll();
    void this.loadMeetUrl();
    void this.loadFichiers();
    void this.loadMeetSessions();
  }

  // ==================================================
  // CHARGER LES GROUPES
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
  // CHARGER LE LIEN GOOGLE MEET
  // ==================================================

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
      this.editingMeetUrl.set(!url.trim());
    } catch (error) {
      console.error('LOAD MEET URL ERROR:', error);
      this.errorMsg.set('وقع خطأ أثناء تحميل رابط Meet');
    }
  }

  // ==================================================
  // ENREGISTRER LE LIEN GOOGLE MEET
  // ==================================================

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
        this.errorMsg.set('المرجو إدخال رابط Google Meet صحيح');
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
      this.editingMeetUrl.set(false);
      this.successMsg.set('تم حفظ رابط Meet بنجاح');
    } catch (error) {
      console.error('SAVE MEET URL ERROR:', error);
      this.errorMsg.set('وقع خطأ أثناء حفظ الرابط');
    } finally {
      this.savingMeetUrl.set(false);
    }
  }

  // ==================================================
  // ENREGISTRER LES HORAIRES DES SEANCES
  // ==================================================

  async validerMeet(): Promise<void> {
    if (this.saving() || this.savingMeetUrl()) {
      return;
    }

    this.clearMessages();

    const link = this.meetUrl().trim();
    const slots = this.meetSlots();

    if (!link) {
      this.errorMsg.set('خاصك تحفظ رابط Meet أولا');
      return;
    }

    if (slots.length === 0) {
      this.errorMsg.set('المرجو إضافة حصة واحدة على الأقل');
      return;
    }

    if (slots.some(slot => !slot.groupeId)) {
      this.errorMsg.set('المرجو اختيار المجموعة لكل حصة');
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
      this.errorMsg.set('المرجو تحديد تاريخ ووقت كل حصة');
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
          'فشل حفظ المواعيد: ' + error.message
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

  // ==================================================
  // CHARGER LES SEANCES GOOGLE MEET
  // ==================================================

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

      const sessions: MeetCard[] = (data ?? []).map((row: any) => {
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
  // SUPPRIMER UNE SEANCE GOOGLE MEET
  // ==================================================

  async supprimerMeetSession(session: MeetCard): Promise<void> {
    const key = this.meetDeleteKey(session);

    if (this.deletingItem() !== null) {
      return;
    }

    const confirme = window.confirm(
      `واش متأكد من حذف حصة المجموعة "${session.groupe_nom}"؟`
    );

    if (!confirme) {
      return;
    }

    this.clearMessages();
    this.deletingItem.set(key);

    try {
      const { error } = await this.sb.client
        .from('cours')
        .delete()
        .eq('groupe_id', session.groupe_id)
        .eq('date_heure', session.date_heure)
        .eq('meet_link', session.meet_link)
        .is('fichier_url', null);

      if (error) {
        console.error('DELETE MEET ERROR:', error);
        throw error;
      }

      await this.loadMeetSessions();
      this.successMsg.set('تم حذف الحصة بنجاح');
    } catch (error: any) {
      console.error('DELETE MEET ERROR:', error);
      this.errorMsg.set(error?.message || 'تعذر حذف الحصة');
    } finally {
      this.deletingItem.set(null);
    }
  }

  // ==================================================
  // SELECTION DES GROUPES POUR LES PDF
  // ==================================================

  togglePdfGroup(pdfIndex: number, groupeId: string): void {
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

  isPdfGroupSelected(pdfIndex: number, groupeId: string): boolean {
    return this.pdfUploads()[pdfIndex]?.groupeIds.includes(groupeId)
      ?? false;
  }

  // ==================================================
  // RETIRER UN PDF DE LA LISTE AVANT ENREGISTREMENT
  // ==================================================

  removePdf(index: number): void {
    this.pdfUploads.update(list =>
      list.filter((_, i) => i !== index)
    );
  }

  // ==================================================
  // UPLOADER UN PDF VERS SUPABASE STORAGE
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

    let uploadedPath: string | null = null;

    try {
      const fileName = `${crypto.randomUUID()}.pdf`;
      uploadedPath = fileName;

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
  // ENREGISTRER LES PDF ET LEURS GROUPES
  // ==================================================

  async validerPdf(): Promise<void> {
    if (this.saving() || this.uploadingFichier()) {
      return;
    }

    this.clearMessages();

    const uploads = this.pdfUploads();

    if (uploads.length === 0) {
      this.errorMsg.set('المرجو إضافة ملف PDF واحد على الأقل');
      return;
    }

    if (uploads.some(pdf => pdf.groupeIds.length === 0)) {
      this.errorMsg.set(
        'المرجو اختيار مجموعة واحدة على الأقل لكل ملف'
      );
      return;
    }

    this.saving.set(true);

    try {
      const rows = uploads.flatMap(pdf =>
        pdf.groupeIds.map(groupeId => ({
          groupe_id: groupeId,
          fichier_url: pdf.fichier_url,
          fichier_nom: pdf.nom,
          date_heure: null,
          meet_link: null
        }))
      );

      const { error } = await this.sb.client
        .from('cours')
        .insert(rows);

      if (error) {
        console.error('PDF SAVE ERROR:', error);
        this.errorMsg.set('فشل حفظ الملفات: ' + error.message);
        return;
      }

      this.pdfUploads.set([]);
      await this.loadFichiers();

      this.successMsg.set('تم حفظ ملفات PDF بنجاح');
    } catch (error: any) {
      console.error('PDF SAVE ERROR:', error);
      this.errorMsg.set(
        error?.message || 'وقع خطأ أثناء حفظ ملفات PDF'
      );
    } finally {
      this.saving.set(false);
    }
  }

  // ==================================================
  // CHARGER LES PDF ENREGISTRES
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

  // ==================================================
  // SUPPRIMER UN PDF ET SES AFFECTATIONS
  // ==================================================

  async supprimerPdf(pdf: PdfCard): Promise<void> {
    if (this.deletingItem() !== null) {
      return;
    }

    const confirme = window.confirm(
      `واش متأكد من حذف الملف "${pdf.nom}" من جميع المجموعات؟`
    );

    if (!confirme) {
      return;
    }

    this.clearMessages();
    this.deletingItem.set(pdf.fichier_url);

    try {
      /*
       * 1. استخراج مسار الملف في Storage قبل الحذف.
       */
      let filePath: string | null = null;

      try {
        const url = new URL(pdf.fichier_url);
        const marker = '/devoirs-fichiers/';
        const markerIndex = url.pathname.indexOf(marker);

        if (markerIndex !== -1) {
          filePath = decodeURIComponent(
            url.pathname.substring(markerIndex + marker.length)
          );
        }
      } catch (error) {
        console.error('INVALID PDF URL:', error);
      }

      /*
       * 2. حذف جميع سجلات الملف من قاعدة البيانات.
       */
      const { error: dbError } = await this.sb.client
        .from('cours')
        .delete()
        .eq('fichier_url', pdf.fichier_url);

      if (dbError) {
        console.error('DELETE PDF DATABASE ERROR:', dbError);
        throw dbError;
      }

      /*
       * 3. تحديث القائمة بعد حذف السجلات.
       */
      this.coursesPdf.update(list =>
        list.filter(item => item.fichier_url !== pdf.fichier_url)
      );

      /*
       * 4. حذف الملف من Storage.
       */
      if (!filePath) {
        this.successMsg.set(
          'تحيدات سجلات الملف، ولكن تعذر تحديد مساره في التخزين.'
        );
        await this.loadFichiers();
        return;
      }

      const { error: storageError } = await this.sb.client.storage
        .from('devoirs-fichiers')
        .remove([filePath]);

      if (storageError) {
        console.error('DELETE PDF STORAGE ERROR:', storageError);

        await this.loadFichiers();

        this.errorMsg.set(
          'تحيدات سجلات الملف من قاعدة البيانات، ولكن فشل حذف الملف من التخزين: ' +
          storageError.message
        );

        return;
      }

      /*
       * 5. تحديث القائمة وعرض رسالة النجاح.
       */
      await this.loadFichiers();
      this.successMsg.set('تم حذف ملف PDF بنجاح');
    } catch (error: any) {
      console.error('DELETE PDF ERROR:', error);

      this.errorMsg.set(
        error?.message || 'تعذر حذف ملف PDF'
      );

      await this.loadFichiers();
    } finally {
      this.deletingItem.set(null);
    }
  }
}
