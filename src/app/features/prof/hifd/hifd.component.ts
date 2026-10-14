import { Component, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { SupabaseService } from '../../../core/services/supabase.service';

interface Groupe {
  id: string;
  nom: string;
}

interface Etudiant {
  id: string;
  nom: string;
  groupe_id: string;
  groupe: string;
  groupes: Groupe[]
}

interface Sourate {
  id: number;
  nom: string;
  nombre_ayat?: number;
}

interface Suivi {
  id: string;
  etudiant_id: string;
  sourate_id: number;
  ayat_debut: number;
  ayat_fin: number;
  statut: string;
  evaluation: string;
  updated_at: string;
  groupe_id: string;

  etudiant: {
    id: string;
    nom: string;
    groupe: string;
  };

  sourate: string;
}

@Component({
  selector: 'app-hifd',
  standalone: true,
  imports: [CommonModule, SidebarComponent],
  templateUrl: './hifd.component.html',
  styleUrl: './hifd.component.css'
})
export class HifdComponent implements OnInit {

  constructor(
    private route: ActivatedRoute,
    private sb: SupabaseService
  ) {}

  // ==============================
  // UI
  // ==============================

  loading = signal(false);
  formLoading = signal(false);
  showModal = signal(false);
  modeEdit = signal(false);

  // ==============================
  // FILTRES
  // ==============================

  filtreGroupe = signal('');
  filtreEtudiant = signal('');
  filtreStatut = signal('');

  // ==============================
  // DONNEES
  // ==============================

  groupes = signal<Groupe[]>([]);
  etudiants = signal<Etudiant[]>([]);
  sourates = signal<Sourate[]>([]);
  suivi = signal<Suivi[]>([]);

  // ==============================
  // FORMULAIRE
  // ==============================

  form = signal({
    id: null as string | null,
    etudiant_id: '',
    sourate_id: '',
    ayat_debut: 1,
    ayat_fin: 1,
    statut: '',
    evaluation: ''
  });

  // ==============================
  // INIT
  // ==============================

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      this.filtreEtudiant.set(
        String(params['etudiant'] ?? '')
      );

      void this.loadData();
    });
  }

  // ==============================
  // CHARGEMENT DES DONNEES
  // ==============================

  
async loadData(): Promise<void> {
  this.loading.set(true);

  try {
    // 1. Charger les groupes
    const { data: groupesData, error: groupesError } =
      await this.sb.client
        .from('groupes')
        .select('id, nom')
        .order('nom');

    if (groupesError) throw groupesError;

    const listeGroupes: Groupe[] = (groupesData || []).map(
      (g: any) => ({
        id: String(g.id),
        nom: String(g.nom || '')
      })
    );

    this.groupes.set(listeGroupes);

    // 2. Charger les sourates
    const { data: souratesData, error: souratesError } =
      await this.sb.client
        .from('sourates')
        .select('id, nom')
        .order('id', { ascending: true });

    if (souratesError) throw souratesError;

    this.sourates.set(
      (souratesData || []).map((s: any) => ({
        id: Number(s.id),
        nom: String(s.nom || '')
      }))
    );

    // 3. Charger les étudiants
    const { data: studentsData, error: studentsError } =
      await this.sb.client
        .from('profiles')
        .select('id, nom')
        .eq('role', 'etudiant')
        .order('nom');

    if (studentsError) throw studentsError;

    // 4. Charger les relations étudiant / groupe
    const { data: relationsData, error: relationsError } =
      await this.sb.client
        .from('groupe_etudiants')
        .select('groupe_id, etudiant_id');

    if (relationsError) throw relationsError;

    // 5. Construire la liste des étudiants avec leurs groupes
    const listeEtudiants: Etudiant[] = (studentsData || []).map(
      (e: any) => {
        const groupesEtudiant = (relationsData || [])
          .filter(
            (r: any) => String(r.etudiant_id) === String(e.id)
          )
          .map((r: any) =>
            listeGroupes.find(
              g => String(g.id) === String(r.groupe_id)
            )
          )
          .filter((g): g is Groupe => !!g);

        const premierGroupe = groupesEtudiant[0];

        return {
          id: String(e.id),
          nom: String(e.nom || ''),
          groupes: groupesEtudiant,
          groupe_id: premierGroupe ? String(premierGroupe.id) : '',
          groupe: premierGroupe?.nom || ''
        };
      }
    );

    this.etudiants.set(listeEtudiants);

    console.log('GROUPES:', listeGroupes);
    console.log('ÉTUDIANTS AVEC GROUPES:', listeEtudiants);

    // 6. Charger le suivi
    await this.loadSuivi();

  } catch (error: any) {
    console.error('Erreur loadData:', error);

    this.etudiants.set([]);
    this.groupes.set([]);
    this.sourates.set([]);
    this.suivi.set([]);

    alert(
      error?.message ||
      'حدث خطأ أثناء تحميل البيانات'
    );
  } finally {
    this.loading.set(false);
  }
}

  // ==============================
  // CHARGEMENT DU SUIVI
  // ==============================

  async loadSuivi(): Promise<void> {

    const {
      data,
      error
    } = await this.sb.client
      .from('suivi_sourates')
      .select(`
        id,
        etudiant_id,
        sourate_id,
        ayat_debut,
        ayat_fin,
        statut,
        evaluation,
        updated_at,
        profiles:etudiant_id (
          id,
          nom,
          groupe_id
        ),
        sourates:sourate_id (
          id,
          nom
        )
      `)
      .order('id', { ascending: false });

    console.log('SUIVI DATA:', data);
    console.log('SUIVI ERROR:', error);

    if (error) {
      console.error('Erreur loadSuivi:', error);
      this.suivi.set([]);
      throw error;
    }

    const listeEtudiants = this.etudiants();
    const listeGroupes = this.groupes();

    const resultat: Suivi[] = (data || []).map(
      (h: any) => {

        // La relation peut être un objet ou un tableau
        const profile = Array.isArray(h.profiles)
          ? h.profiles[0]
          : h.profiles;

        const sourateData = Array.isArray(h.sourates)
          ? h.sourates[0]
          : h.sourates;

        const etudiantId = String(
          profile?.id ?? h.etudiant_id
        );

        const etudiant = listeEtudiants.find(
          e => e.id === etudiantId
        );

        const groupeId = etudiant?.groupe_id || '';
        const groupe = listeGroupes.find(
          g => String(g.id) === groupeId
        );

        return {
          id: String(h.id),
          etudiant_id: String(h.etudiant_id),
          sourate_id: Number(h.sourate_id),
          ayat_debut: Number(h.ayat_debut || 1),
          ayat_fin: Number(h.ayat_fin || 1),
          statut: String(h.statut || ''),
          evaluation: String(h.evaluation || ''),
          updated_at: String(h.updated_at || ''),
          groupe_id: groupeId,

          etudiant: {
            id: etudiantId,
            nom: String(
              profile?.nom || etudiant?.nom ||'طالب غير معروف'
            ),
            groupe: String(
              groupe?.nom || etudiant?.groupe || ''
            )
          },

          sourate: String(
            sourateData?.nom || 'سورة غير موجودة'
          )
        };
      }
    );

    this.suivi.set(resultat);

    console.log('SUIVI FINAL:', this.suivi());
  }

  // ==============================
  // ETUDIANTS FILTRES PAR GROUPE
  // ==============================

  etudiantsFiltres = computed(() => {

    const groupeId = this.filtreGroupe();

    if (!groupeId) {
      return this.etudiants();
    }

    return this.etudiants().filter(
      e => String(e.groupe_id) === String(groupeId)
    );
  });

  // ==============================
  // FILTRE DU TABLEAU
  // ==============================

  suiviFiltres = computed(() => {

    const groupeId = this.filtreGroupe();
    const etudiantId = this.filtreEtudiant();
    const statut = this.filtreStatut();

    return this.suivi().filter(h => {

      const matchGroupe =
        !groupeId ||
        String(h.groupe_id) === String(groupeId);

      const matchEtudiant =
        !etudiantId ||
        String(h.etudiant_id) === String(etudiantId);

      const matchStatut =
        !statut ||
        h.statut === statut;

      return (
        matchGroupe &&
        matchEtudiant &&
        matchStatut
      );
    });
  });

  // ==============================
  // EVENEMENTS FILTRES
  // ==============================

  onFiltreGroupe(value: string): void {

    this.filtreGroupe.set(String(value ?? ''));

    // Réinitialiser l'étudiant s'il ne correspond
    // pas au groupe sélectionné
    const etudiantId = this.filtreEtudiant();

    if (etudiantId) {
      const etudiant = this.etudiants().find(
        e => e.id === etudiantId
      );

      if (
        !etudiant ||
        (
          value !== '' &&
          String(etudiant.groupe_id) !== String(value)
        )
      ) {
        this.filtreEtudiant.set('');
      }
    }
  }

  onFiltreEtudiant(value: string): void {
    this.filtreEtudiant.set(String(value ?? ''));
  }

  onFiltreStatut(value: string): void {
    this.filtreStatut.set(String(value ?? ''));
  }

  reinitialiserFiltres(): void {
    this.filtreGroupe.set('');
    this.filtreEtudiant.set('');
    this.filtreStatut.set('');
  }

  // ==============================
  // SOURATE
  // ==============================

  getSourateNom(): string {

    const sourateId = Number(
      this.form().sourate_id
    );

    return this.sourates().find(
      s => Number(s.id) === sourateId
    )?.nom ?? '';
  }

  // ==============================
  // FORMULAIRE
  // ==============================

  updateForm(field: string, value: any): void {
    this.form.update(f => ({
      ...f,
      [field]: value
    }));
  }

  ouvrirAjout(): void {

    this.modeEdit.set(false);

    this.form.set({
      id: null,
      etudiant_id: this.filtreEtudiant(),
      sourate_id: '',
      ayat_debut: 1,
      ayat_fin: 1,
      statut: '',
      evaluation: ''
    });

    this.showModal.set(true);
  }

  modifier(h: Suivi): void {

    this.modeEdit.set(true);

    this.form.set({
      id: h.id,
      etudiant_id: h.etudiant_id,
      sourate_id: String(h.sourate_id),
      ayat_debut: h.ayat_debut,
      ayat_fin: h.ayat_fin,
      statut: h.statut,
      evaluation: h.evaluation
    });

    this.showModal.set(true);
  }

  fermerModal(): void {
    this.showModal.set(false);
  }

  // ==============================
  // AJOUT / MODIFICATION
  // ==============================

  async soumettre(): Promise<void> {

    const f = this.form();

    if (
      !f.etudiant_id ||
      !f.sourate_id ||
      !f.statut ||
      !f.evaluation
    ) {
      alert('عمر جميع الخانات المطلوبة');
      return;
    }

    const debut = Number(f.ayat_debut);
    const fin = Number(f.ayat_fin);

    if (
      !Number.isInteger(debut) ||
      !Number.isInteger(fin) ||
      debut < 1 ||
      fin < debut
    ) {
      alert('الآيات المدخلة غير صحيحة');
      return;
    }

    if (this.formLoading()) return;

    this.formLoading.set(true);

    try {

      const payload = {
        etudiant_id: f.etudiant_id,
        sourate_id: Number(f.sourate_id),
        ayat_debut: debut,
        ayat_fin: fin,
        statut: f.statut,
        evaluation: f.evaluation,
        updated_at: new Date().toISOString()
      };

      const result =
        this.modeEdit() && f.id
          ? await this.sb.client
              .from('suivi_sourates')
              .update(payload)
              .eq('id', f.id)
          : await this.sb.client
              .from('suivi_sourates')
              .insert(payload);

      if (result.error) {
        throw result.error;
      }

      await this.loadSuivi();
      this.showModal.set(false);

      alert(
        this.modeEdit()
          ? 'تم تحديث الحفظ بنجاح'
          : 'تم إضافة الحفظ بنجاح'
      );

    } catch (error: any) {

      console.error('Erreur sauvegarde:', error);

      alert(
        error?.message ||
        'حدث خطأ أثناء الحفظ'
      );

    } finally {
      this.formLoading.set(false);
    }
  }

  // ==============================
  // SUPPRESSION
  // ==============================

  async supprimer(h: Suivi): Promise<void> {

    if (!h.id || h.id === 'undefined') {
      alert('معرف الحفظ غير صالح');
      return;
    }

    if (!confirm(`هل تريد حذف حفظ ${h.sourate}؟`)) {
      return;
    }

    try {

      const { error } = await this.sb.client
        .from('suivi_sourates')
        .delete()
        .eq('id', h.id);

      if (error) throw error;

      await this.loadSuivi();

      alert('تم حذف الحفظ بنجاح');

    } catch (error: any) {

      console.error('Erreur suppression:', error);

      alert(
        error?.message ||
        'حدث خطأ أثناء الحذف'
      );
    }
  }

  // ==============================
  // BADGES
  // ==============================

  badge(statut: string): string {

    const badges: Record<string, string> = {
      'مكتمل': 'badge-green',
      'جاري': 'badge-blue',
      'مراجعة': 'badge-amber',
      'لم يبدأ': 'badge-gray'
    };

    return badges[statut] || 'badge-gray';
  }

  evaluationBadge(evaluation: string): string {

    const badges: Record<string, string> = {
      'ممتاز': 'badge-green',
      'جيد': 'badge-blue',
      'متوسط': 'badge-amber',
      'ضعيف': 'badge-gray'
    };

    return badges[evaluation] || 'badge-gray';
  }
}
