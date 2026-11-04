import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

import { SupabaseService } from '../../../core/services/supabase.service';
import { SidebarComponent } from '../sidebar/sidebar.component';

interface CoursPdf {
  id: number;
  titre: string;
  fichier_url: string;
  groupe_id: string | number;
  type: 'image' | 'pdf' | 'other';
}

@Component({
  selector: 'app-mes-cours',
  standalone: true,
  imports: [CommonModule, SidebarComponent],
  templateUrl: './mes-cours.component.html',
  styleUrl: './mes-cours.component.css'
})
export class MesCoursComponent implements OnInit {

  constructor(private sb: SupabaseService) {}

  loading = false;
  downloadingId: number | null = null;
  errorMsg = '';
  successMsg = '';

  cours: CoursPdf[] = [];

  // يجب أن يطابق اسم الـ Bucket الموجود في Supabase
  private readonly BUCKET_NAME = 'devoirs-fichiers';

  ngOnInit(): void {
    void this.loadCours();
  }

  // =========================================
  // تحميل دروس مجموعات الطالب
  // =========================================

  async loadCours(): Promise<void> {
    this.loading = true;
    this.errorMsg = '';

    try {
      // 1. المستخدم المتصل
      const { data: authData, error: authError } =
        await this.sb.client.auth.getUser();

      if (authError) throw authError;

      const userId = authData.user?.id;

      if (!userId) {
        throw new Error('لم يتم العثور على المستخدم المسجل');
      }

      // 2. مجموعات الطالب
      const { data: relations, error: relationsError } =
        await this.sb.client
          .from('groupe_etudiants')
          .select('groupe_id')
          .eq('etudiant_id', userId);

      if (relationsError) throw relationsError;

      const groupeIds = [
        ...new Set((relations ?? []).map((r: any) => r.groupe_id))
      ];

      if (groupeIds.length === 0) {
        this.cours = [];
        return;
      }

      // 3. الدروس التابعة لمجموعات الطالب فقط
      const { data, error } = await this.sb.client
        .from('cours')
        .select('id, fichier_nom, fichier_url, groupe_id')
        .in('groupe_id', groupeIds)
        .not('fichier_url', 'is', null)
        .order('date_heure', { ascending: true });

      if (error) throw error;

      // 4. تحديد نوع الملف انطلاقاً من امتداده الأصلي
      this.cours = (data ?? []).map((row: any) => {
        const extension = this.getExtension(row.fichier_url)
          || this.getExtension(row.fichier_nom || '');

        return {
          id: row.id,
          titre: row.fichier_nom || this.getFileNameFromUrl(row.fichier_url),
          fichier_url: row.fichier_url,
          groupe_id: row.groupe_id,
          type: this.getFileType(extension)
        };
      });

    } catch (error: any) {
      console.error('Erreur chargement cours:', error);
      this.errorMsg = error?.message || 'تعذر تحميل الدروس';
      this.cours = [];

    } finally {
      this.loading = false;
    }
  }

  // =========================================
  // تحميل الملف مع الحفاظ على نوعه الأصلي
  // =========================================

  async downloadCours(course: CoursPdf): Promise<void> {
    if (this.downloadingId !== null) return;

    this.downloadingId = course.id;
    this.errorMsg = '';
    this.successMsg = '';

    let blobUrl: string | null = null;

    try {
      // استخراج مسار الملف داخل Storage
      const storagePath = this.getStoragePath(course.fichier_url);

      console.log('Storage path:', storagePath);

      // تحميل الملف من Supabase
      const { data, error } = await this.sb.client.storage
        .from(this.BUCKET_NAME)
        .download(storagePath);

      if (error) {
        console.error('Supabase download error:', error);
        throw error;
      }

      if (!data || data.size === 0) {
        throw new Error('الملف فارغ أو لم يتم تحميله بشكل صحيح');
      }

      // استخراج الامتداد الأصلي
      const urlExtension = this.getExtension(course.fichier_url);
      const titleExtension = this.getExtension(course.titre);

      const extension =
        urlExtension ||
        titleExtension ||
        this.getExtensionFromMime(data.type);

      // تحديد نوع MIME إذا لم يكن موجوداً
      const mimeType = data.type || this.getMimeType(extension);

      // إنشاء Blob مع الحفاظ على نوع الملف
      const correctBlob = new Blob([data], {
        type: mimeType || 'application/octet-stream'
      });

      // إنشاء اسم الملف مع الامتداد الصحيح
      const originalName = this.getFileNameFromUrl(course.fichier_url);

      let fileName = course.titre || originalName || 'cours';

      // إزالة امتداد خاطئ من العنوان وإضافة الامتداد الأصلي
      fileName = fileName.replace(/\.[^/.]+$/, '');

      if (extension) {
        fileName = `${fileName}.${extension}`;
      } else {
        // لا نفرض PDF على ملف لا نعرف نوعه
        fileName = `${fileName}.file`;
      }

      // إزالة الرموز غير المقبولة في أسماء ملفات Windows
      fileName = this.cleanFileName(fileName);

      // إنشاء رابط التحميل
      blobUrl = URL.createObjectURL(correctBlob);

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      link.style.display = 'none';

      document.body.appendChild(link);
      link.click();
      link.remove();

      this.successMsg = 'تم تحميل الملف بنجاح';

      // لا نحذف الرابط مباشرة حتى يتمكن المتصفح من بدء التحميل
      const urlToRevoke = blobUrl;

      window.setTimeout(() => {
        URL.revokeObjectURL(urlToRevoke);
      }, 3000);

      blobUrl = null;

    } catch (error: any) {
      console.error('DOWNLOAD ERROR:', error);

      this.errorMsg =
        error?.message || 'حدث خطأ أثناء تحميل الملف';

      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }

    } finally {
      this.downloadingId = null;
    }
  }

  // =========================================
  // استخراج مسار الملف من رابط Supabase
  // =========================================

  private getStoragePath(url: string): string {
    if (!url) {
      throw new Error('رابط الملف غير موجود');
    }

    // إذا كان المخزن في قاعدة البيانات هو المسار مباشرة
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return decodeURIComponent(url);
    }

    const parsedUrl = new URL(url);
    const parts = parsedUrl.pathname.split('/');

    const objectIndex = parts.indexOf('object');

    if (objectIndex === -1) {
      throw new Error('رابط الملف غير صالح');
    }

    // الصيغة:
    // /storage/v1/object/public/BUCKET_NAME/folder/file.pdf
    // أو:
    // /storage/v1/object/sign/BUCKET_NAME/folder/file.pdf

    const bucketIndex = objectIndex + 2;
    const bucketName = parts[bucketIndex];

    if (bucketName !== this.BUCKET_NAME) {
      throw new Error(
        `اسم Bucket غير مطابق: ${bucketName}`
      );
    }

    const pathParts = parts.slice(bucketIndex + 1);

    if (pathParts.length === 0) {
      throw new Error('مسار الملف غير موجود داخل Storage');
    }

    return pathParts
      .map(part => decodeURIComponent(part))
      .join('/');
  }

  // =========================================
  // استخراج اسم الملف من الرابط
  // =========================================

  private getFileNameFromUrl(url: string): string {
    try {
      const parsedUrl = new URL(url);
      const parts = parsedUrl.pathname.split('/');
      const lastPart = parts[parts.length - 1];

      return decodeURIComponent(lastPart || 'cours');
    } catch {
      return 'cours';
    }
  }

  // =========================================
  // استخراج الامتداد
  // =========================================

  private getExtension(value: string): string {
    if (!value) return '';

    const cleanValue = value.split('?')[0].split('#')[0];
    const fileName = cleanValue.split('/').pop() || '';
    const match = fileName.match(/\.([a-zA-Z0-9]+)$/);

    return match ? match[1].toLowerCase() : '';
  }

  private getExtensionFromMime(mime: string): string {
    const mimeMap: Record<string, string> = {
      'application/pdf': 'pdf',
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'image/svg+xml': 'svg',
      'image/bmp': 'bmp',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.ms-excel': 'xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'application/vnd.ms-powerpoint': 'ppt',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx'
    };

    return mimeMap[mime] || '';
  }

  // =========================================
  // تحديد نوع الملف للعرض
  // =========================================

  private getFileType(extension: string): 'image' | 'pdf' | 'other' {
    const images = [
      'jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg'
    ];

    if (images.includes(extension)) return 'image';
    if (extension === 'pdf') return 'pdf';

    return 'other';
  }

  // =========================================
  // MIME TYPE
  // =========================================

  private getMimeType(extension: string): string {
    const mimeMap: Record<string, string> = {
      pdf: 'application/pdf',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif',
      svg: 'image/svg+xml',
      bmp: 'image/bmp',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    };

    return mimeMap[extension] || 'application/octet-stream';
  }

  // =========================================
  // تنظيف اسم الملف
  // =========================================

  private cleanFileName(name: string): string {
    return name
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      .trim();
  }
}