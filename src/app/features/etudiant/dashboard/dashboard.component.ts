import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { SidebarComponent } from '../sidebar/sidebar.component';


interface SourateEnCours {
  id: number;
  nom: string;
  nom_arabe?: string;
  nbAyat: number;
  ayatEnCours: number;
  pourcentage: number;
}

export interface StudentMeetSession {
  groupe_id: string | number;
  date_heure: string;
  meet_link: string;
  groupe_nom: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, SidebarComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit {

  // ================================
  // UI
  // ================================

  loading = signal(true);

  // ================================
  // ETUDIANT
  // ================================

  etudiant = signal<any>(null);

  // ================================
  // PRESENCES
  // ================================

  presences = signal<any[]>([]);

  presenceCount = computed(() =>
    this.presences().filter(
      p => this.normalizeStatus(p.statut) === 'حاضر'
    ).length
  );

  absenceCount = computed(() =>
    this.presences().filter(
      p => this.normalizeStatus(p.statut) === 'غائب'
    ).length
  );

  totalPresences = computed(() =>
    this.presences().length
  );

  tauxPresence = computed(() => {
    const total = this.totalPresences();

    return total > 0
      ? Math.round((this.presenceCount() / total) * 100)
      : 0;
  });

  // ================================
  // GROUPES
  // ================================

 async loadStudentGroupes(id: string): Promise<void> {

  const { data, error } = await this.sb.client
    .from('groupe_etudiants')
    .select(`
      groupe_id,
      groupes (
        id,
        nom,
        couleur,
        programme_id
      )
    `)
    .eq('etudiant_id', id);

  if (error) {
      console.error('Erreur chargement groupes:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint  
    });
    this.studentGroupes.set([]);
    return;
  }

  const groupes = (data || [])
    .map((row: any) => {
      const groupe = row.groupes;

      return Array.isArray(groupe)
        ? groupe[0]
        : groupe;
    })
    .filter((g: any) => g != null);

  this.studentGroupes.set(groupes);

  console.log('Groupes chargés:', groupes);
}


  // ================================
  // SUIVI HIFD
  // ================================

  suiviSourates = signal<any[]>([]);
  sourates = signal<any[]>([]);
  selectedSourate = signal<any>(null);
  studentGroupes = signal<any[]>([]);

  souratesMktmla = computed(() =>
    this.suiviSourates().filter(
      s => this.isCompletedStatus(s.statut)
    ).length
  );

  souratesEnCours = computed(() =>
    this.suiviSourates().filter(
      s => this.isInProgressStatus(s.statut)
    ).length
  );

  tauxHifd = computed(() => {
    const total = this.suiviSourates().length;

    return total > 0
      ? Math.round((this.souratesMktmla() / total) * 100)
      : 0;
  });

  // ================================
  // DEVOIRS
  // ================================

  devoirs = signal<any[]>([]);

  devoirsTotal = computed(() =>
    this.devoirs().length
  );

  devoirsRemis = computed(() =>
    this.devoirs().filter(d => {
      const statut = this.normalizeStatus(d.statut);

      return ['مسلم', 'تم التسليم'].includes(statut);
    }).length
  );

  devoirsNonRemis = computed(() =>
    this.devoirs().filter(
      d => this.normalizeStatus(d.statut) === 'لم يسلّم'
    ).length
  );

  // ================================
  // GRAPH HIFD
  // ================================

  hifdGraph = computed(() => {
    const suivis = this.suiviSourates();

    return suivis
      .slice()
      .sort((a, b) => {
        const dateA = new Date(a.updated_at || 0).getTime();
        const dateB = new Date(b.updated_at || 0).getTime();

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

  // ================================
  // DETAILS HIFD
  // ================================

  allSourates = signal<any[]>([]);
  suiviDetails = signal<any[]>([]);

  // ================================
  // STATISTIQUES DES AYAT
  // نفس طريقة الحساب الموجودة في RAPPORTS
  // ================================

  hifdStats = computed(() => {
    const sourates = this.allSourates();
    const suivis = this.suiviDetails();

    const totalAyat = sourates.reduce(
      (sum, s) =>
        sum + Math.max(0, Number(s.nb_ayat) || 0),
      0
    );

    let ayatCompletees = 0;
    let ayatEnCours = 0;

    for (const sourate of sourates) {
      const id = Number(sourate.id);
      const nbAyat = Math.max(
        0,
        Number(sourate.nb_ayat) || 0
      );

      if (!id || nbAyat <= 0) {
        continue;
      }

      const liste = suivis.filter(
        s => Number(s.sourate_id) === id
      );

      // السورة المكتملة: جميع آياتها مكتملة
      if (
        liste.some(s => this.isCompletedStatus(s.statut))
      ) {
        ayatCompletees += nbAyat;
        continue;
      }

      // جمع فترات الآيات الصحيحة
      const intervals: [number, number][] = [];

      for (const s of liste) {
        const debut = Math.max(
          1,
          Number(s.ayat_debut) || 1
        );

        const fin = Math.min(
          nbAyat,
          Number(s.ayat_fin) || 0
        );

        if (fin >= debut) {
          intervals.push([debut, fin]);
        }
      }

      if (intervals.length === 0) {
        continue;
      }

      // ترتيب الفترات حسب الآية الأولى
      intervals.sort((a, b) => a[0] - b[0]);

      // دمج الفترات المتداخلة أو المتتابعة
      let debut = intervals[0][0];
      let fin = intervals[0][1];

      for (let i = 1; i < intervals.length; i++) {
        const [nouveauDebut, nouvelleFin] = intervals[i];

        if (nouveauDebut <= fin + 1) {
          fin = Math.max(fin, nouvelleFin);
        } else {
          ayatEnCours += fin - debut + 1;

          debut = nouveauDebut;
          fin = nouvelleFin;
        }
      }

      ayatEnCours += fin - debut + 1;
    }

    // حماية من تجاوز مجموع الآيات
    ayatCompletees = Math.min(
      ayatCompletees,
      totalAyat
    );

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
        ? Math.round(
            (ayatCompletees / totalAyat) * 100
          )
        : 0
    };
  });

  // ================================
  // CONSTRUCTOR
  // ================================

  constructor(
    public auth: AuthService,
    private sb: SupabaseService,
    private router: Router
  ) {}

  // ================================
  // INIT
  // ================================

  ngOnInit(): void {
    void this.loadDashboard();
  }

  // ================================
  // LOAD DASHBOARD
  // ================================

  
async loadDashboard(): Promise<void> {
  this.loading.set(true);

  try {
    const user = this.auth.currentUser();

    if (!user?.id) {
      console.error('Aucun étudiant authentifié.');
      this.resetDashboard();
      return;
    }

    // 1. تحميل المجموعات أولا
    await this.loadStudentGroupes(user.id);

    // 2. تحميل باقي البيانات بالتوازي
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

    // 3. المجموعات ولات واجدة، نجيبو الحصص ديالها
    await this.loadStudentMeetSessions();

  } catch (error) {
    console.error('Dashboard étudiant error:', error);
  } finally {
    this.loading.set(false);
  }
}

  // ================================
  // RESET
  // ================================

  private resetDashboard(): void {
    this.etudiant.set(null);
    this.presences.set([]);
    this.suiviSourates.set([]);
    this.suiviDetails.set([]);
    this.allSourates.set([]);
    this.sourates.set([]);
    this.selectedSourate.set(null);
    this.devoirs.set([]);
  }

  // ================================
  // LOAD ETUDIANT
  // ================================

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

    const {
      data: relations,
      error: relationsError
    } = await this.sb.client
      .from('groupe_etudiants')
      .select('groupe_id')
      .eq('etudiant_id', id);

    if (relationsError) {
      console.error(
        'Erreur relations groupes:',
        relationsError
      );

      this.etudiant.set({
        ...data,
        groupes: []
      });

      return;
    }

    const groupeIds = (relations || [])
      .map((r: any) => r.groupe_id)
      .filter(
        (groupId: string | null) => groupId !== null
      );

    let groupes: any[] = [];

    if (groupeIds.length > 0) {
      const {
        data: groupesData,
        error: groupesError
      } = await this.sb.client
        .from('groupes')
        .select('id, nom')
        .in('id', groupeIds);

      if (groupesError) {
        console.error(
          'Erreur chargement groupes:',
          groupesError
        );
      } else {
        groupes = groupesData || [];
      }
    }

    this.etudiant.set({
      ...data,
      groupes
    });
  }

  // ================================
  // LOAD PRESENCES
  // ================================

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

  // ================================
  // LOAD SUIVI SOURATES
  // ================================

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

    this.selectedSourate.set(
      list.length > 0 ? list[0] : null
    );
  }

  // ================================
  // LOAD ALL SOURATES
  // ================================

  async loadAllSourates(): Promise<void> {
    const { data, error } = await this.sb.client
      .from('sourates')
      .select('*')
      .order('id', { ascending: true })
      .range(0, 999);

    if (error) {
      console.error(
        'Erreur chargement sourates:',
        error
      );

      this.allSourates.set([]);

      return;
    }

    const souratesNormalisees = (data || []).map(
      (s: any) => {
        const nbAyat = Number(
          s.nb_ayat ??
          s.nombre_ayat ??
          s.total_ayat ??
          s.ayat_count ??
          s.nombre_versets ??
          0
        );

        return {
          ...s,
          id: Number(s.id),
          nb_ayat: Number.isFinite(nbAyat)
            ? Math.max(0, nbAyat)
            : 0
        };
      }
    );

    this.allSourates.set(souratesNormalisees);
  }

  // ================================
  // LOAD DETAILS DU SUIVI
  // ================================

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

  // ================================
  // NORMALISATION DES STATUTS
  // ================================

  normalizeStatus(
    value: string | null | undefined
  ): string {
    return String(value ?? '')
      .trim()
      .toLowerCase();
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

  // ================================
  // DONUT GRADIENT - 3 COULEURS
  // ================================

  getHifdDonutGradient(): string {
    const stats = this.hifdStats();

    if (stats.totalAyat <= 0) {
      return '#e5e7eb';
    }

    const p1 = Math.min(
      100,
      (stats.ayatCompletees / stats.totalAyat) * 100
    );

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

  // ================================
  // SOURATE MAP HELPERS
  // ================================

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

  // ================================
  // TOTAL DES SOURATES SUIVIES
  // ================================

  getStudentHifdTotal(): number {
    return new Set(
      this.suiviDetails()
        .map(s => Number(s.sourate_id))
        .filter(
          id => Number.isFinite(id) && id > 0
        )
    ).size;
  }

  getStudentHifdCompletees(): number {
    return new Set(
      this.suiviDetails()
        .filter(s =>
          this.isSourateCompletee(
            Number(s.sourate_id)
          )
        )
        .map(s => Number(s.sourate_id))
        .filter(
          id => Number.isFinite(id) && id > 0
        )
    ).size;
  }

  // ================================
  // RESOLUTION NOM SOURATE
  // ================================

  getSourateNomById(sourateId: number): string {
    const sourate = this.allSourates().find(
      s => Number(s.id) === Number(sourateId)
    );

    return (
      sourate?.nom ||
      sourate?.nom_ar ||
      sourate?.nom_arabe ||
      sourate?.name ||
      sourate?.sourate ||
      'سورة غير معروفة'
    );
  }

  // ================================
  // SELECT SOURATE
  // ================================

  selectSourate(event: Event): void {
    const value = (
      event.target as HTMLSelectElement
    ).value;

    const sourate = this.sourates().find(
      s => String(
        s.id ||
        s.sourate ||
        s.nom_sourate
      ) === value
    );

    this.selectedSourate.set(sourate || null);
  }

  // ================================
  // SOURATE HELPERS
  // ================================

  getSourateName(sourate: any): string {
    return (
      sourate?.sourate ||
      sourate?.nom_sourate ||
      sourate?.sourate_nom ||
      sourate?.nom ||
      '—'
    );
  }

  
/* =========================================
   SOURATE ACTUELLE
========================================= */

getSourateEnCours(): SourateEnCours | null {
  const suivis = [...this.suiviDetails()].sort(
    (a, b) =>
      new Date(b.updated_at || 0).getTime() -
      new Date(a.updated_at || 0).getTime()
  );

  const sourates = this.allSourates();

  // آخر متابعة لكل سورة
  const derniers = new Map<number, any>();

  for (const suivi of suivis) {
    const id = Number(suivi.sourate_id);

    if (id > 0 && !derniers.has(id)) {
      derniers.set(id, suivi);
    }
  }

  // الحالات اللي كتدل على أن السورة مكتملة
  const candidates = Array.from(derniers.values()).filter(
    suivi => !this.isCompletedStatus(suivi.statut)
  );

  for (const suivi of candidates) {
    const sourate = sourates.find(
      s => Number(s.id) === Number(suivi.sourate_id)
    );

    if (!sourate) continue;

    const nbAyat = Math.max(
      0,
      Number(sourate.nb_ayat) || 0
    );

    if (nbAyat <= 0) continue;

    // جميع المتابعات ديال السورة الحالية
    const liste = suivis.filter(
      s => Number(s.sourate_id) === Number(sourate.id)
    );

    // حساب الآيات بدون تكرار
    const intervals: [number, number][] = [];

    for (const s of liste) {
      const debut = Math.max(
        1,
        Number(s.ayat_debut) || 1
      );

      const fin = Math.min(
        nbAyat,
        Number(s.ayat_fin) || 0
      );

      if (fin >= debut) {
        intervals.push([debut, fin]);
      }
    }

    intervals.sort((a, b) => a[0] - b[0]);

    let enCours = 0;

    if (intervals.length > 0) {
      let debut = intervals[0][0];
      let fin = intervals[0][1];

      for (let i = 1; i < intervals.length; i++) {
        const [nouveauDebut, nouvelleFin] = intervals[i];

        if (nouveauDebut <= fin + 1) {
          fin = Math.max(fin, nouvelleFin);
        } else {
          enCours += fin - debut + 1;

          debut = nouveauDebut;
          fin = nouvelleFin;
        }
      }

      enCours += fin - debut + 1;
    }

    enCours = Math.min(enCours, nbAyat);

    return {
      id: Number(sourate.id),
      nom: sourate.nom || sourate.name || '',
      nom_arabe:
        sourate.nom_arabe ||
        sourate.nom_ar ||
        sourate.arabic_name ||
        '',
      nbAyat,
      ayatEnCours: enCours,
      pourcentage: Math.round(
        (enCours / nbAyat) * 100
      )
    };
  }

  return null;
}

/* =========================================
   STATISTIQUES DE LA SOURATE ACTUELLE
========================================= */

getCurrentSourateStats() {
  const current = this.getSourateEnCours();

  if (!current) {
    return null;
  }

  const total = current.nbAyat;
  const enCours = current.ayatEnCours;

  return {
    total,
    enCours,
    remaining: Math.max(0, total - enCours),
    percentEnCours: total > 0
      ? Math.round((enCours / total) * 100)
      : 0
  };
}

/* =========================================
   DONUT DE LA SOURATE ACTUELLE
========================================= */

getCurrentSourateDonutGradient(): string {
  const stats = this.getCurrentSourateStats();

  if (!stats || stats.total <= 0) {
    return '#E5E7EB';
  }

  const pourcentage = Math.min(
    100,
    Math.max(
      0,
      (stats.enCours / stats.total) * 100
    )
  );

  return `conic-gradient(
    #1B6FA8 0% ${pourcentage}%,
    #E5E7EB ${pourcentage}% 100%
  )`;
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
      return Math.round(
        Math.min(100, (fin / total) * 100)
      );
    }

    return 0;
  }

  getSourateStatus(sourate: any): string {
    if (!sourate) {
      return '—';
    }

    return sourate.statut || 'غير محدد';
  }

  // ================================
  // DATE
  // ================================

  today(): string {
    return new Date().toLocaleDateString('ar-MA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  formatDate(
    date: string | null | undefined
  ): string {
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

  // ================================
  // NAVIGATION
  // ================================

  navigateTo(path: string): void {
    this.router.navigate(['/etudiant', path]);
  }

   // ================================
  // GOOGLE MEET LINK
  // ================================

  meetSessions = signal<StudentMeetSession[]>([]);
  loadingMeetSessions = signal(false);


  canJoinMeet(session: StudentMeetSession): boolean {
  const start = new Date(session.date_heure).getTime();
  const now = Date.now();

  if (!Number.isFinite(start)) {
    return false;
  }

  const end = start + 60 * 60 * 1000;

  return now >= start && now < end;
}

getMeetStatus(session: StudentMeetSession): string {
  const start = new Date(session.date_heure).getTime();
  const now = Date.now();

  if (!Number.isFinite(start)) {
    return 'تاريخ الحصة غير صالح';
  }

  const end = start + 60 * 60 * 1000;

  if (now < start) {
    return 'الحصة لم تبدأ بعد';
  }

  if (now >= end) {
    return 'انتهى وقت الحصة';
  }

  return 'الحصة جارية الآن';
}


async loadStudentMeetSessions(): Promise<void> {
  this.loadingMeetSessions.set(true);

  try {
    const groupIds = this.studentGroupes()
      .map(g => g.id)
      .filter(id => id != null);

    console.log('Student groups:', this.studentGroupes());
    console.log('Group IDs for Meet:', groupIds);

    if (groupIds.length === 0) {
      this.meetSessions.set([]);
      return;
    }

    const { data, error } = await this.sb.client
      .from('cours')
      .select('groupe_id, date_heure, meet_link, groupes(nom)')
      .in('groupe_id', groupIds)
      .not('meet_link', 'is', null)
      .not('date_heure', 'is', null)
      .order('date_heure', { ascending: true });

    console.log('Meet sessions query result:', data);
    console.log('Meet sessions query error:', error);

    if (error) {
      console.error('STUDENT MEET ERROR:', error);
      this.meetSessions.set([]);
      return;
    }

    const sessions: StudentMeetSession[] = (data ?? [])
      .filter(row => !!row.meet_link && !!row.date_heure)
      .map(row => {
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
          groupe_nom: groupe?.nom ?? 'مجموعة'
        };
      });

    this.meetSessions.set(sessions);
  } catch (error) {
    console.error('STUDENT MEET ERROR:', error);
    this.meetSessions.set([]);
  } finally {
    this.loadingMeetSessions.set(false);
  }
}

getMeetEndTime(dateHeure: string): Date {
  return new Date(
    new Date(dateHeure).getTime() + 60 * 60 * 1000
  );
}
}



