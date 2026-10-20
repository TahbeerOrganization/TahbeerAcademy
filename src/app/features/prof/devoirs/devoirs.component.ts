
import { Component, HostListener, OnInit, signal } from '@angular/core';
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
  type: 'pdf' | 'image';
}

export interface PdfCard {
  fichier_url: string;
  nom: string;
  groupes: string[];
  groupeIds: string[];
  type: 'pdf' | 'image';
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
  // NAVIGATION ET MODALS
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
    this.closeModal();
  }

  closeModal(): void {
    // Ne pas fermer pendant une sauvegarde ou un upload.
    if (
      this.saving() ||
      this.uploadingFichier() ||
      this.savingMeetUrl()
    ) {
      return;
    }

    this.activeView.set('home');
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeModal();
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
  // ETAT GENERAL ET MESSAGES
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
  // PDF ET IMAGES
  // ==================================================

  pdfUploads = signal<PdfUpload[]>([]);
  uploadingFichier = signal(false);
  coursesPdf = signal<PdfCard[]>([]);

  
  // ==================================================
  // MODIFIER LES GROUPES D'UN FICHIER
  // ==================================================

  editingPdf = signal<PdfCard | null>(null);
  editPdfGroupIds = signal<string[]>([]);
  savingPdfGroups = signal(false);

  ouvrirEditionPdf(pdf: PdfCard): void {
    this.clearMessages();

    this.editingPdf.set(pdf);
    this.editPdfGroupIds.set([...pdf.groupeIds]);
  }

  fermerEditionPdf(): void {
    if (this.savingPdfGroups()) {
      return;
    }

    this.editingPdf.set(null);
    this.editPdfGroupIds.set([]);
  }

  toggleEditPdfGroup(groupeId: string): void {
    this.editPdfGroupIds.update(ids =>
      ids.includes(groupeId)
        ? ids.filter(id => id !== groupeId)
        : [...ids, groupeId]
    );
  }

  isEditPdfGroupSelected(groupeId: string): boolean {
    return this.editPdfGroupIds().includes(groupeId);
  }

  async enregistrerGroupesPdf(): Promise<void> {
    const pdf = this.editingPdf();

    if (!pdf || this.savingPdfGroups()) {
      return;
    }

    this.clearMessages();

    const selectedIds = this.editPdfGroupIds();

    if (selectedIds.length === 0) {
      this.errorMsg.set(
        'المرجو اختيار مجموعة واحدة على الأقل'
      );
      return;
    }

    this.savingPdfGroups.set(true);

    try {
      // 1. Récupérer les affectations actuelles du fichier.
      const { data, error } = await this.sb.client
        .from('cours')
        .select('groupe_id')
        .eq('fichier_url', pdf.fichier_url);

      if (error) {
        throw error;
      }

      const currentIds = [
        ...new Set((data ?? []).map(row =>
          String(row.groupe_id)
        ))
      ];

      const wantedIds = [...new Set(selectedIds)];

      const idsToAdd = wantedIds.filter(
        id => !currentIds.includes(id)
      );

      const idsToRemove = currentIds.filter(
        id => !wantedIds.includes(id)
      );

      // 2. Ajouter les nouvelles affectations sans toucher
      // aux groupes déjà associés au fichier.
      if (idsToAdd.length > 0) {
        const rows = idsToAdd.map(groupeId => ({
          groupe_id: groupeId,
          fichier_url: pdf.fichier_url,
          fichier_nom: pdf.nom,
          date_heure: null,
          meet_link: null
        }));

        const { error: insertError } = await this.sb.client
          .from('cours')
          .insert(rows);

        if (insertError) {
          throw insertError;
        }
      }

      // 3. Supprimer uniquement les affectations décochées.
      if (idsToRemove.length > 0) {
        const { error: deleteError } = await this.sb.client
          .from('cours')
          .delete()
          .eq('fichier_url', pdf.fichier_url)
          .in('groupe_id', idsToRemove);

        if (deleteError) {
          throw deleteError;
        }
      }

      // 4. Actualiser la liste et fermer le modal.
      await this.loadFichiers();

      this.editingPdf.set(null);
      this.editPdfGroupIds.set([]);

      this.successMsg.set(
        'تم تحديث المجموعات المستفيدة من الملف بنجاح'
      );
    } catch (error: any) {
      console.error('UPDATE PDF GROUPS ERROR:', error);

      this.errorMsg.set(
        error?.message ||
        'تعذر تحديث المجموعات ديال الملف'
      );
    } finally {
      this.savingPdfGroups.set(false);
    }
  }

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
        this.errorMsg.set('فشل حفظ المواعيد: ' + error.message);
        return;
      }

      this.meetSlots.set([
        { groupeId: '', date: '', time: '' }
      ]);

      await this.loadMeetSessions();

      this.successMsg.set('تم حفظ مواعيد الحصص بنجاح');

      // Retour à Home après la sauvegarde.
      this.activeView.set('home');
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
  // SELECTION DES GROUPES POUR LES FICHIERS
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

  removePdf(index: number): void {
    this.pdfUploads.update(list =>
      list.filter((_, i) => i !== index)
    );
  }

  // ==================================================
  // UPLOADER UN PDF OU UNE IMAGE VERS SUPABASE STORAGE
  // ==================================================

  async onFichierSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    this.clearMessages();

    const extension = file.name.split('.').pop()?.toLowerCase();

    const allowedTypes: Record<string, string> = {
      pdf: 'application/pdf',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg'
    };

    const expectedType = extension
      ? allowedTypes[extension]
      : undefined;

    if (!expectedType || file.type !== expectedType) {
      this.errorMsg.set(
        'المرجو اختيار ملف PDF أو صورة PNG أو JPG أو JPEG'
      );
      input.value = '';
      return;
    }

    const maxSize = 10 * 1024 * 1024;

    if (file.size > maxSize) {
      this.errorMsg.set('حجم الملف خاصو ما يفوتش 10 MB');
      input.value = '';
      return;
    }

    this.uploadingFichier.set(true);

    try {
      const fileName = `${crypto.randomUUID()}.${extension}`;

      const { data, error } = await this.sb.client.storage
        .from('devoirs-fichiers')
        .upload(fileName, file, {
          contentType: expectedType,
          upsert: false
        });

      if (error) {
        console.error('UPLOAD ERROR:', error);
        this.errorMsg.set('فشل رفع الملف: ' + error.message);
        return;
      }

      const { data: publicData } = this.sb.client.storage
        .from('devoirs-fichiers')
        .getPublicUrl(data.path);

      this.pdfUploads.update(list => [
        ...list,
        {
          fichier_url: publicData.publicUrl,
          nom: file.name,
          groupeIds: [],
          type: extension === 'pdf' ? 'pdf' : 'image'
        }
      ]);

      this.successMsg.set(
        'تم رفع الملف بنجاح. اختر المجموعات المستفيدة منه.'
      );
    } catch (error) {
      console.error('UPLOAD ERROR:', error);
      this.errorMsg.set('وقع خطأ أثناء رفع الملف');
    } finally {
      this.uploadingFichier.set(false);
      input.value = '';
    }
  }

  // ==================================================
  // ENREGISTRER LES FICHIERS ET LEURS GROUPES
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
        console.error('FILE SAVE ERROR:', error);
        this.errorMsg.set('فشل حفظ الملفات: ' + error.message);
        return;
      }

      this.pdfUploads.set([]);
      await this.loadFichiers();

      this.successMsg.set('تم حفظ الملفات والصور بنجاح');

      // Retour à Home après la sauvegarde.
      this.activeView.set('home');
    } catch (error: any) {
      console.error('FILE SAVE ERROR:', error);
      this.errorMsg.set(
        error?.message || 'وقع خطأ أثناء حفظ الملفات'
      );
    } finally {
      this.saving.set(false);
    }
  }

  // ==================================================
  // CHARGER LES FICHIERS ENREGISTRES
  // ==================================================

  async loadFichiers(): Promise<void> {
    try {
      const { data, error } = await this.sb.client
        .from('cours')
        .select('fichier_url, fichier_nom, groupe_id, groupes(nom)')
        .not('fichier_url', 'is', null);

      if (error) {
        console.error('FICHIERS ERROR:', error);
        this.errorMsg.set('تعذر تحميل ملفات الدروس والصور');
        return;
      }

      const map = new Map<
        string,
        {
          nom: string;
          groupes: Set<string>;          
          groupeIds: Set<string>;
          type: 'pdf' | 'image';
        }
      >();

      for (const row of data ?? []) {
        const url = row.fichier_url as string | null;

        if (!url) {
          continue;
        }

        const nomOriginal = row.fichier_nom as string | null;
        let nomUrl = 'fichier.pdf';

        try {
          const parsedUrl = new URL(url);
          nomUrl = decodeURIComponent(
            parsedUrl.pathname.split('/').pop() || 'fichier.pdf'
          );
        } catch {
          nomUrl = url.split('/').pop()?.split('?')[0] || 'fichier.pdf';
        }

        const nom = nomOriginal?.trim() || nomUrl;
        const extension = nom.split('.').pop()?.toLowerCase() || '';

        const type: 'pdf' | 'image' =
          ['png', 'jpg', 'jpeg'].includes(extension)
            ? 'image'
            : 'pdf';

        if (!map.has(url)) {
          map.set(url, {
            nom,
            groupes: new Set<string>(),           
            groupeIds: new Set<string>(),
            type
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
        if (row.groupe_id !== null && row.groupe_id !== undefined) {
          map.get(url)!.groupeIds.add(String(row.groupe_id));
        }
      }
      
      this.coursesPdf.set(
        Array.from(map.entries()).map(([fichier_url, info]) => ({
          fichier_url,
          nom: info.nom,
          groupes: Array.from(info.groupes),
          groupeIds: Array.from(info.groupeIds),
          type: info.type
        }))
      );
    } catch (error) {
      console.error('FICHIERS ERROR:', error);
      this.errorMsg.set('وقع خطأ أثناء تحميل ملفات الدروس والصور');
    }
  }

  // ==================================================
  // SUPPRIMER UN FICHIER ET SES AFFECTATIONS
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
        console.error('INVALID FILE URL:', error);
      }

      // Supprimer les affectations de la base de données.
      const { error: dbError } = await this.sb.client
        .from('cours')
        .delete()
        .eq('fichier_url', pdf.fichier_url);

      if (dbError) {
        console.error('DELETE FILE DATABASE ERROR:', dbError);
        throw dbError;
      }

      this.coursesPdf.update(list =>
        list.filter(item => item.fichier_url !== pdf.fichier_url)
      );

      if (!filePath) {
        this.successMsg.set(
          'تحيدات سجلات الملف، ولكن تعذر تحديد مساره في التخزين.'
        );
        await this.loadFichiers();
        return;
      }

      // Supprimer le fichier du Storage.
      const { error: storageError } = await this.sb.client.storage
        .from('devoirs-fichiers')
        .remove([filePath]);

      if (storageError) {
        console.error('DELETE FILE STORAGE ERROR:', storageError);

        await this.loadFichiers();

        this.errorMsg.set(
          'تحيدات سجلات الملف من قاعدة البيانات، ولكن فشل حذف الملف من التخزين: ' +
          storageError.message
        );
        return;
      }

      await this.loadFichiers();
      this.successMsg.set('تم حذف الملف بنجاح');
    } catch (error: any) {
      console.error('DELETE FILE ERROR:', error);

      this.errorMsg.set(
        error?.message || 'تعذر حذف الملف'
      );

      await this.loadFichiers();
    } finally {
      this.deletingItem.set(null);
    }
  }
}