
import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { SidebarComponent } from '../sidebar/sidebar.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, SidebarComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit {

  // UI
  loading = signal(true);

  // ETUDIANT
  etudiant = signal<any>(null);

  // PRESENCE
  presences = signal<any[]>([]);

  presenceCount = computed(() =>
    this.presences().filter(p =>
      this.normalizeStatus(p.statut) === 'حاضر'
    ).length
  );

  absenceCount = computed(() =>
    this.presences().filter(p =>
      this.normalizeStatus(p.statut) === 'غائب'
    ).length
  );

  totalPresences = computed(() => this.presences().length);

  tauxPresence = computed(() => {
    const total = this.totalPresences();

    return total === 0
      ? 0
      : Math.round((this.presenceCount() / total) * 100);
  });

  // GROUPES
  studentGroupesList = computed<any[]>(() => {
    const groupes = this.etudiant()?.groupes;

    if (!groupes) {
      return [];
    }

    return Array.isArray(groupes) ? groupes : [groupes];
  });

  // HIFD
  suiviSourates = signal<any[]>([]);
  sourates = signal<any[]>([]);
  selectedSourate = signal<any>(null);

  souratesMktmla = computed(() =>
    this.suiviSourates().filter(s =>
      this.isCompletedStatus(s.statut)
    ).length
  );

  souratesEnCours = computed(() =>
    this.suiviSourates().filter(s =>
      this.isInProgressStatus(s.statut)
    ).length
  );

  tauxHifd = computed(() => {
    const total = this.suiviSourates().length;

    return total === 0
      ? 0
      : Math.round((this.souratesMktmla() / total) * 100);
  });

  // DEVOIRS
  devoirs = signal<any[]>([]);

  devoirsTotal = computed(() => this.devoirs().length);

  devoirsRemis = computed(() =>
    this.devoirs().filter(d => {
      const statut = this.normalizeStatus(d.statut);

      return ['مسلم', 'تم التسليم'].includes(statut);
    }).length
  );

  devoirsNonRemis = computed(() =>
    this.devoirs().filter(d =>
      this.normalizeStatus(d.statut) === 'لم يسلّم'
    ).length
  );

  // GRAPH HIFD
  hifdGraph = computed(() => {
    const suivis = this.suiviSourates();

    return suivis
      .slice()
      .sort((a, b) => {
        const dateA = new Date(
          a.updated_at || 0
        ).getTime();

        const dateB = new Date(
          b.updated_at || 0
        ).getTime();

        return dateA - dateB;
      })
      .map((s, index, sorted) => {
        const completed = sorted
          .slice(0, index + 1)
          .filter(x => this.isCompletedStatus(x.statut))
          .length;

        return {
          date: s.updated_at,
          value: completed
        };
      });
  });

  // RAPPORT DETAILLE HIFD
  allSourates = signal<any[]>([]);
  suiviDetails = signal<any[]>([]);

  // STATISTIQUES DES AYAT
  hifdStats = computed(() => {
    const suivis = this.suiviDetails();
    const sourates = this.allSourates();

    const souratesMap = new Map<number, any[]>();

    for (const suivi of suivis) {
      const id = Number(suivi.sourate_id);

      if (!Number.isFinite(id) || id <= 0) {
        continue;
      }

      if (!souratesMap.has(id)) {
        souratesMap.set(id, []);
      }

      souratesMap.get(id)!.push(suivi);
    }

    let totalAyat = 0;
    let ayatCompletees = 0;
    let ayatEnCours = 0;

    for (const [id, liste] of souratesMap) {
      const sourate = sourates.find(
        s => Number(s.id) === id
      );

      const nbAyat = Number(sourate?.nb_ayat ?? 0);

      if (nbAyat <= 0) {
        continue;
      }

      totalAyat += nbAyat;

      const complete = liste.some(s =>
        this.isCompletedStatus(s.statut) ||
        Number(s.ayat_fin) >= nbAyat
      );

      if (complete) {
        ayatCompletees += nbAyat;
      } else {
        const maxFin = Math.max(
          0,
          ...liste.map(s => Number(s.ayat_fin) || 0)
        );

        ayatEnCours += Math.min(maxFin, nbAyat);
      }
    }

    ayatCompletees = Math.min(ayatCompletees, totalAyat);

    ayatEnCours = Math.min(
      ayatEnCours,
      Math.max(0, totalAyat - ayatCompletees)
    );

    const ayatRestantes = Math.max(
      0,
      totalAyat - ayatCompletees - ayatEnCours
    );

    return {
      totalAyat,
      ayatCompletees,
      ayatEnCours,
      ayatRestantes,
      pourcentage: totalAyat > 0
        ? Math.round((ayatCompletees / totalAyat) * 100)
        : 0
    };
  });

  constructor(
    public auth: AuthService,
    private sb: SupabaseService,
    private router: Router
  ) {}

  ngOnInit(): void {
    void this.loadDashboard();
  }

  // LOAD DASHBOARD
  async loadDashboard(): Promise<void> {
    this.loading.set(true);

    try {
      const user = this.auth.currentUser();

      if (!user?.id) {
        console.error('Aucun étudiant authentifié.');
        this.etudiant.set(null);
        this.presences.set([]);
        this.suiviSourates.set([]);
        this.suiviDetails.set([]);
        this.allSourates.set([]);
        this.devoirs.set([]);
        return;
      }

      const results = await Promise.allSettled([
        this.loadEtudiant(user.id),
        this.loadPresences(user.id),
        this.loadSuiviSourates(user.id),
        this.loadAllSourates(),
        this.loadSuiviDetails(user.id)
      ]);

      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(
            `Erreur chargement dashboard [${index}]:`,
            result.reason
          );
        }
      });
    } catch (error) {
      console.error('Dashboard étudiant error:', error);
    } finally {
      this.loading.set(false);
    }
  }

  // LOAD ETUDIANT
  // Profil chargé séparément pour éviter PGRST201.
  
async loadEtudiant(id: string): Promise<void> {
  const { data, error } = await this.sb.client
    .from('profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) {
    console.error('Erreur étudiant:', error);
    this.etudiant.set(null);
    return;
  }

  // جلب علاقات الطالب بالمجموعات
  const { data: relations, error: relationsError } =
    await this.sb.client
      .from('groupe_etudiants')
      .select('groupe_id')
      .eq('etudiant_id', id);

  if (relationsError) {
    console.error('Erreur relations groupes:', relationsError);
    this.etudiant.set({ ...data, groupes: [] });
    return;
  }

  const groupeIds = (relations || [])
    .map((r: any) => r.groupe_id)
    .filter((id: string | null) => id !== null);

  // جلب معلومات المجموعات
  let groupes: any[] = [];

  if (groupeIds.length > 0) {
    const { data: groupesData, error: groupesError } =
      await this.sb.client
        .from('groupes')
        .select('id, nom')
        .in('id', groupeIds);

    if (groupesError) {
      console.error('Erreur chargement groupes:', groupesError);
    } else {
      groupes = groupesData || [];
    }
  }

  this.etudiant.set({
    ...data,
    groupes
  });

  console.log('Groupes étudiant:', groupes);
}

  // LOAD PRESENCES
  async loadPresences(id: string): Promise<void> {
    const { data, error } = await this.sb.client
      .from('presences')
      .select('*')
      .eq('etudiant_id', id)
      .order('date', { ascending: false });

    if (error) {
      console.error('Erreur présences:', error);
      this.presences.set([]);
      return;
    }

    this.presences.set(data || []);
  }

  // LOAD SUIVI SOURATES
  async loadSuiviSourates(id: string): Promise<void> {
    const { data, error } = await this.sb.client
      .from('suivi_sourates')
      .select('*')
      .eq('etudiant_id', id)
      .order('updated_at', { ascending: true });

    if (error) {
      console.error('Erreur suivi sourates:', error);
      this.suiviSourates.set([]);
      this.sourates.set([]);
      this.selectedSourate.set(null);
      return;
    }

    this.suiviSourates.set(data || []);

    const unique = new Map<string, any>();

    (data || []).forEach((item: any) => {
      const nom =
        item.sourate ||
        item.nom_sourate ||
        item.sourate_nom;

      if (nom && !unique.has(String(nom))) {
        unique.set(String(nom), item);
      }
    });

    const list = Array.from(unique.values());

    this.sourates.set(list);
    this.selectedSourate.set(list.length > 0 ? list[0] : null);
  }

 
  // LOAD ALL SOURATES
  async loadAllSourates(): Promise<void> {
    const { data, error } = await this.sb.client
      .from('sourates')
      .select('*')
      .order('id', { ascending: true });

    if (error) {
      console.error('Erreur chargement sourates:', error);
      this.allSourates.set([]);
      return;
    }

    this.allSourates.set(
      (data || []).map((s: any) => ({
        ...s,
        nb_ayat: Number(
          s.nb_ayat ??
          s.nombre_ayat ??
          s.total_ayat ??
          s.ayat_count ??
          0
        )
      }))
    );
  }

  // LOAD DETAILS DU SUIVI
  async loadSuiviDetails(id: string): Promise<void> {
    const { data, error } = await this.sb.client
      .from('suivi_sourates')
      .select('*')
      .eq('etudiant_id', id)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Erreur détails hifd:', error);
      this.suiviDetails.set([]);
      return;
    }

    this.suiviDetails.set(data || []);
  }

  // NORMALISATION DES STATUTS
  private normalizeStatus(
    value: string | null | undefined
  ): string {
    return String(value ?? '').trim().toLowerCase();
  }

  isCompletedStatus(
    value: string | null | undefined
  ): boolean {
    return [
      'مكتمل',
      'مكتملة',
      'كامل',
      'كاملة',
      'complete',
      'completed'
    ].includes(this.normalizeStatus(value));
  }

  isInProgressStatus(
    value: string | null | undefined
  ): boolean {
    return [
      'جاري',
      'جارية',
      'قيد الحفظ',
      'مراجعة',
      'en cours',
      'in progress',
      'review'
    ].includes(this.normalizeStatus(value));
  }

  // DONUT GRADIENT
  getHifdDonutGradient(): string {
    const stats = this.hifdStats();

    if (stats.totalAyat <= 0) {
      return '#e5e7eb';
    }

    const p1 =
      (stats.ayatCompletees / stats.totalAyat) * 100;

    const p2 = Math.min(
      100,
      p1 + (stats.ayatEnCours / stats.totalAyat) * 100
    );

    return `conic-gradient(
      #1d9e75 0% ${p1}%,
      #1b6fa8 ${p1}% ${p2}%,
      #e5e7eb ${p2}% 100%
    )`;
  }

  // SOURATE MAP HELPERS
  isSourateCompletee(sourateId: number): boolean {
    const sourate = this.allSourates().find(
      x => Number(x.id) === Number(sourateId)
    );

    const nbAyat = Number(sourate?.nb_ayat ?? 0);

    return this.suiviDetails().some(s =>
      Number(s.sourate_id) === Number(sourateId) &&
      (
        this.isCompletedStatus(s.statut) ||
        (
          nbAyat > 0 &&
          Number(s.ayat_fin) >= nbAyat
        )
      )
    );
  }

  isSourateEnCours(sourateId: number): boolean {
    return this.suiviDetails().some(s =>
      Number(s.sourate_id) === Number(sourateId) &&
      (
        this.isInProgressStatus(s.statut) ||
        Number(s.ayat_fin) > 0
      )
    );
  }

  // TOTAL DES SOURATES SUIVIES
  getStudentHifdTotal(): number {
    return new Set(
      this.suiviDetails()
        .map(s => Number(s.sourate_id))
        .filter(id => Number.isFinite(id) && id > 0)
    ).size;
  }

  getStudentHifdCompletees(): number {
    return new Set(
      this.suiviDetails()
        .filter(s =>
          this.isSourateCompletee(Number(s.sourate_id))
        )
        .map(s => Number(s.sourate_id))
    ).size;
  }

  // RESOLUTION DU NOM DE LA SOURATE
  getSourateNomById(sourateId: number): string {
    const sourate = this.allSourates().find(
      s => Number(s.id) === Number(sourateId)
    );

    return sourate?.nom ||
      sourate?.nom_ar ||
      sourate?.name ||
      sourate?.sourate ||
      'سورة غير معروفة';
  }

  // SELECT SOURATE
  selectSourate(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;

    const sourate = this.sourates().find(
      s => String(
        s.id ||
        s.sourate ||
        s.nom_sourate
      ) === value
    );

    this.selectedSourate.set(sourate || null);
  }

  // SOURATE HELPERS
  getSourateName(sourate: any): string {
    return (
      sourate?.sourate ||
      sourate?.nom_sourate ||
      sourate?.sourate_nom ||
      sourate?.nom ||
      '—'
    );
  }

  getSourateProgress(sourate: any): number {
    if (!sourate) {
      return 0;
    }

    const value =
      sourate.progression ??
      sourate.pourcentage;

    if (value != null) {
      const progress = Number(value);

      return Number.isFinite(progress)
        ? Math.max(0, Math.min(100, progress))
        : 0;
    }

    if (this.isCompletedStatus(sourate.statut)) {
      return 100;
    }

    const fin = Number(sourate.ayat_fin);
    const total = Number(sourate.nb_ayat);

    if (fin > 0 && total > 0) {
      return Math.round(Math.min(100, (fin / total) * 100));
    }

    return 0;
  }

  getSourateStatus(sourate: any): string {
    if (!sourate) {
      return '—';
    }

    return sourate.statut || 'غير محدد';
  }

  // DATE
  today(): string {
    return new Date().toLocaleDateString('ar-MA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  formatDate(date: string | null | undefined): string {
    if (!date) {
      return '—';
    }

    const parsed = new Date(date);

    if (Number.isNaN(parsed.getTime())) {
      return '—';
    }

    return parsed.toLocaleDateString('ar-MA', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  // NAVIGATION
  navigateTo(path: string): void {
    this.router.navigate(['/etudiant', path]);
  }
}