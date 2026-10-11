import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

import { SupabaseService } from '../../../core/services/supabase.service';
import { SidebarComponent } from '../sidebar/sidebar.component';

interface CoursPdf {
  id: number;
  titre: string;
  fichier_url: string;
  groupe_id: string | number;
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
  errorMsg = '';
  cours: CoursPdf[] = [];

  ngOnInit(): void {
    void this.loadCours();
  }

  async loadCours(): Promise<void> {
    this.loading = true;
    this.errorMsg = '';

    try {
      const { data, error } = await this.sb.client
        .from('cours')
        .select('id, fichier_nom, fichier_url, groupe_id')
        .not('fichier_url', 'is', null)
        .order('id', { ascending: false });

      if (error) {
        console.error('LOAD COURS ERROR:', error);
        this.errorMsg = 'تعذر تحميل ملفات الدروس';
        return;
      }

      this.cours = (data ?? []).map(row => ({
        id: row.id,
        titre: row.fichier_nom || 'ملف PDF',
        fichier_url: row.fichier_url,
        groupe_id: row.groupe_id
      }));
    } catch (error) {
      console.error('LOAD COURS ERROR:', error);
      this.errorMsg = 'وقع خطأ أثناء تحميل الدروس';
    } finally {
      this.loading = false;
    }
  }

  async downloadCours(course: CoursPdf): Promise<void> {
    try {
      const { data, error } = await this.sb.client.storage
        .from('devoirs-fichiers')
        .download(this.getStoragePath(course.fichier_url));

      if (error) {
        console.error('DOWNLOAD ERROR:', error);
        this.errorMsg = 'فشل تحميل الملف، حاول مرة أخرى';
        return;
      }

      const blobUrl = URL.createObjectURL(data);
      const link = document.createElement('a');

      link.href = blobUrl;
      link.download = course.titre.toLowerCase().endsWith('.pdf')
        ? course.titre
        : `${course.titre}.pdf`;

      document.body.appendChild(link);
      link.click();
      link.remove();

      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('DOWNLOAD ERROR:', error);
      this.errorMsg = 'وقع خطأ أثناء تحميل الملف';
    }
  }

  private getStoragePath(url: string): string {
    const marker = '/storage/v1/object/public/devoirs-fichiers/';

    const index = url.indexOf(marker);

    if (index === -1) {
      throw new Error('Invalid PDF storage URL');
    }

    return decodeURIComponent(url.substring(index + marker.length));
  }
}
