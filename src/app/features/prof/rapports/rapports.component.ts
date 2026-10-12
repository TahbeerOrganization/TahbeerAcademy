
import { Component, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { SupabaseService } from '../../../core/services/supabase.service';

interface Etudiant {
  id: string;
  nom: string;
  created_at?: string;
  groupe_id?: number;
}

interface Groupe {
  id: number;
  nom: string;
  type?: string;
  nbEtudiants: number;
}

interface Sourate {
  id: number;
  nom: string;
  nom_arabe?: string;
  nb_ayat?: number;
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
  sourates?: {
    id?: number;
    nom?: string;
    nom_arabe?: string;
    nb_ayat?: number;
  } | null;
}

interface Presence {
  id: string | number;
  etudiant_id?: string;
  date: string;
  statut: string;
}

interface PresenceStat {
  label: string;
  value: number;
  color: string;
}

interface SourateProgression {
  id: number;
  nom: string;
  nom_arabe?: string;
  total: number;
  completees: number;
  enCours: number;
}

interface SourateEnCours {
  id: number;
  nom: string;
  nom_arabe?: string;
  nbAyat: number;
  ayatDebut: number;
  ayatFin: number;
  ayatEnCours: number;
  pourcentage: number;
}

@Component({
  selector: 'app-rapports',
  standalone: true,
  imports: [CommonModule, SidebarComponent],
  templateUrl: './rapports.component.html',
  styleUrl: './rapports.component.css'
})
export class RapportsComponent implements OnInit {

  constructor(
    private route: ActivatedRoute,
    private sb: SupabaseService
  ) {}

  /* =====================================================
     SIGNALS
  ===================================================== */

  loading = signal(false);

  activeReport = signal<'etudiant'>('etudiant');
  etudiants = signal<Etudiant[]>([]);
  groupes = signal<any[]>([]);

  allSourates = signal<Sourate[]>([]);
  allSuivis = signal<Suivi[]>([]);
  studentSuivis = signal<Suivi[]>([]);
  studentPresences = signal<Presence[]>([]);
  studentGroupes = signal<any[]>([]);

  selectedEtudiantId = signal('');

  studentInfo = computed(() => {
    const id = this.selectedEtudiantId();

    if (!id) {
      return null;
    }

    return this.etudiants().find(
      e => String(e.id) === String(id)
    ) || null;
  });

  /* =====================================================
     INITIALISATION
  ===================================================== */

  async ngOnInit(): Promise<void> {
  await this.loadAllSourates();
  await this.loadEtudiants();   // زيدو method صغيرة تجيب غير الطلاب (بلا groupes/evaluations العامة)

  this.route.queryParams.subscribe(params => {
    const id = params['etudiant'];
    if (id) this.selectEtudiant(String(id));
  });
}

  /* =====================================================
     CHARGEMENT DES DONNEES GENERALES
  ===================================================== */

  async loadEtudiants(): Promise<void> {
  const { data, error } = await this.sb.client
    .from('profiles')
    .select('id, nom, created_at')
    .eq('role', 'etudiant')
    .order('nom');

  if (error) {
    console.error('ETUDIANTS:', error);
    this.etudiants.set([]);
    return;
  }

  this.etudiants.set(data || []);
}

  /* =====================================================
     CHARGEMENT DE TOUTES LES SOURATES
  ===================================================== */

  
async loadAllSourates(): Promise<void> {
  const { data, error } = await this.sb.client
    .from('sourates')
    .select('*')
    .order('id', { ascending: true });

  if (error) {
    console.error('LOAD SOURATES:', error.message, error);
    this.allSourates.set([]);
    return;
  }

  const sourates: Sourate[] = (data ?? []).map((s: any) => ({
    id: Number(s.id),
    nom: String(s.nom ?? s.name ?? ''),
    nom_arabe: String(s.nom_arabe ?? s.arabic_name ?? ''),
    nb_ayat: Number(
      s.nb_ayat ?? s.nombre_ayat ?? s.total_ayat ?? s.ayat_count ?? 0
    )
  }));

  this.allSourates.set(sourates);
}

  /* =====================================================
     CHOIX D'UN ETUDIANT
  ===================================================== */

  async selectEtudiant(id: string): Promise<void> {
    this.selectedEtudiantId.set(String(id || ''));

    this.studentSuivis.set([]);
    this.studentPresences.set([]);
    this.studentGroupes.set([]);

    if (!id) {
      return;
    }

    await Promise.all([
      this.loadStudentSuivis(id),
      this.loadStudentPresences(id),
      this.loadStudentGroupes(id)
    ]);
  }

  /* =====================================================
     SUIVI DU HIFD
  ===================================================== */

  
async loadStudentSuivis(id: string): Promise<void> {
  const { data, error } = await this.sb.client
    .from('suivi_sourates')
    .select('*')
    .eq('etudiant_id', id);

  if (error) {
    console.error('LOAD STUDENT SUIVIS:', error.message, error);
    this.studentSuivis.set([]);
    return;
  }

  const sourates = this.allSourates();

  const suivis: Suivi[] = (data ?? []).map((s: any) => {
    const sourateId = Number(s.sourate_id);
    const sourate = sourates.find(x => x.id === sourateId);

    return {
      id: String(s.id),
      etudiant_id: String(s.etudiant_id),
      sourate_id: sourateId,
      ayat_debut: Number(s.ayat_debut ?? s.ayah_start ?? 0),
      ayat_fin: Number(s.ayat_fin ?? s.ayah_end ?? 0),
      statut: String(s.statut ?? ''),
      evaluation: String(s.evaluation ?? ''),
      updated_at: String(s.updated_at ?? ''),
      sourates: sourate
        ? {
            id: sourate.id,
            nom: sourate.nom,
            nom_arabe: sourate.nom_arabe,
            nb_ayat: sourate.nb_ayat
          }
        : null
    };
  });

  suivis.sort(
    (a, b) =>
      new Date(b.updated_at).getTime() -
      new Date(a.updated_at).getTime()
  );

  this.studentSuivis.set(suivis);
}

  /* =====================================================
     PRESENCES
     Vérifier le nom de la table dans Supabase.
  ===================================================== */

  async loadStudentPresences(id: string): Promise<void> {
    const { data, error } = await this.sb.client
      .from('presences')
      .select('id, etudiant_id, date, statut')
      .eq('etudiant_id', id)
      .order('date', { ascending: true });

    if (error) {
      console.error('STUDENT PRESENCES:', error);
      this.studentPresences.set([]);
      return;
    }

    this.studentPresences.set(
      (data || []).map((p: any) => ({
        id: p.id,
        etudiant_id: String(p.etudiant_id),
        date: p.date || '',
        statut: p.statut || ''
      }))
    );
  }

  /* =====================================================
     GROUPES DE L'ETUDIANT
  ===================================================== */

  /* =====================================================
   GROUPES DE L'ETUDIANT (via table groupe_etudiants)
===================================================== */

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
    console.error('STUDENT GROUPES:', error);
    this.studentGroupes.set([]);
    return;
  }

  const groupes = (data || [])
    .map((row: any) =>
      Array.isArray(row.groupes) ? row.groupes[0] : row.groupes
    )
    .filter((g: any) => g != null);

  this.studentGroupes.set(groupes);
}

  /* =====================================================
     RAFRAICHISSEMENT
  ===================================================== */

  async refresh(): Promise<void> {
    await this.loadAllSourates();
    await this.loadEtudiants();

    const id = this.selectedEtudiantId();

    if (id) {
      await this.selectEtudiant(id);
    }
  }

  

  /* =====================================================
     DATES
  ===================================================== */

  formatDate(value: string | null | undefined): string {
    if (!value) {
      return '—';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return '—';
    }

    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(date);
  }

  /* =====================================================
     PRESENCES TRIEES
     Plus récent en premier
  ===================================================== */

  getPresencesSorted(): Presence[] {
    return [...this.studentPresences()].sort(
      (a, b) =>
        new Date(b.date).getTime() -
        new Date(a.date).getTime()
    );
  }

  /* =====================================================
     POURCENTAGE DE PRESENCE
  ===================================================== */

  getPresencePercent(): number {
    const presences = this.studentPresences();

    if (!presences.length) {
      return 0;
    }

    const presents = presences.filter(
      p => p.statut === 'حاضر'
    ).length;

    return Math.round(
      (presents / presences.length) * 100
    );
  }

  /* =====================================================
     STATISTIQUES DU BAR CHART DE PRESENCE
  ===================================================== */

  studentPresenceStats(): PresenceStat[] {
    const presences = this.studentPresences();

    return [
      {
        label: 'حاضر',
        value: presences.filter(
          p => p.statut === 'حاضر'
        ).length,
        color: '#1D9E75'
      },
      {
        label: 'غائب',
        value: presences.filter(
          p => p.statut === 'غائب'
        ).length,
        color: '#D85A30'
      },
      {
        label: 'متأخر',
        value: presences.filter(
          p => p.statut === 'متأخر'
        ).length,
        color: '#D9A441'
      }
    ];
  }

  getMaxPresenceValue(): number {
    return Math.max(
      1,
      ...this.studentPresenceStats().map(s => s.value)
    );
  }

  /* =====================================================
     CALCUL DES AYAT DU HIFD
  ===================================================== */

  
  
  
getHifdAyatStats(): {
  total: number;
  achieved: number;
  enCours: number;
  remaining: number;
  percentAchieved: number;
  percentEnCours: number;
  percent: number;
} {
  const sourates = this.allSourates();
  const suivis = this.studentSuivis();

  // مجموع آيات القرآن كامل
  const total = sourates.reduce(
    (sum, s) => sum + Math.max(0, Number(s.nb_ayat) || 0),
    0
  );

  let achieved = 0;
  let enCours = 0;

  for (const sourate of sourates) {
    const id = Number(sourate.id);
    const nbAyat = Math.max(0, Number(sourate.nb_ayat) || 0);

    if (!id || nbAyat <= 0) continue;

    const liste = suivis.filter(
      s => Number(s.sourate_id) === id
    );

    if (liste.length === 0) continue;

    // واش السورة مكتملة نهائياً؟
    const complete = liste.some(s => {
      const statut = this.normalizeStatus(s.statut);

      return [
        'مكتمل',
        'مكتملة',
        'كامل',
        'كاملة',
        'complete',
        'completed'
      ].includes(statut);
    });

    if (complete) {
      achieved += nbAyat;
      continue;
    }

    // حساب الآيات المسجلة ودمج الفترات المتداخلة
    const intervals: [number, number][] = [];

    for (const s of liste) {
      const debut = Math.max(1, Number(s.ayat_debut) || 1);
      const fin = Math.min(nbAyat, Number(s.ayat_fin) || 0);

      if (fin < debut || fin < 1) continue;

      intervals.push([debut, fin]);
    }

    intervals.sort((a, b) => a[0] - b[0]);

    let start = 0;
    let end = 0;
    let initialized = false;

    for (const [a, b] of intervals) {
      if (a > b) continue;

      if (!initialized) {
        start = a;
        end = b;
        initialized = true;
      } else if (a <= end + 1) {
        end = Math.max(end, b);
      } else {
        enCours += end - start + 1;
        start = a;
        end = b;
      }
    }

    if (initialized) {
      enCours += end - start + 1;
    }
  }

  achieved = Math.min(achieved, total);
  enCours = Math.min(
    enCours,
    Math.max(0, total - achieved)
  );

  const remaining = Math.max(
    0,
    total - achieved - enCours
  );

  const percentAchieved = total > 0
    ? Math.round((achieved / total) * 100)
    : 0;

  // النسبة ديال الآيات الجارية من مجموع آيات القرآن
  const percentEnCours = total > 0
    ? Math.round((enCours / total) * 100)
    : 0;

  return {
    total,
    achieved,
    enCours,
    remaining,
    percentAchieved,
    percentEnCours,
    percent: percentAchieved
  };
}


getSourateEnCours(): SourateEnCours | null {
  const suivis = [...this.studentSuivis()].sort(
    (a, b) =>
      new Date(b.updated_at).getTime() -
      new Date(a.updated_at).getTime()
  );

  const sourates = this.allSourates();

  // آخر متابعة لكل سورة
  const derniers = new Map<number, Suivi>();

  for (const suivi of suivis) {
    const id = Number(suivi.sourate_id);

    if (!derniers.has(id)) {
      derniers.set(id, suivi);
    }
  }

  const completeStatuses = [
    'مكتمل',
    'مكتملة',
    'كامل',
    'كاملة',
    'complete',
    'completed'
  ];

  // اختيار أحدث سورة ما زالت غير مكتملة
  const candidates = Array.from(derniers.values()).filter(
    suivi =>
      !completeStatuses.includes(
        this.normalizeStatus(suivi.statut)
      )
  );

  for (const suivi of candidates) {
    const sourate = sourates.find(
      s => s.id === Number(suivi.sourate_id)
    );

    if (!sourate) continue;

    const nbAyat = Math.max(0, Number(sourate.nb_ayat) || 0);
    if (nbAyat === 0) continue;

    // جميع التسجيلات ديال نفس السورة
    const liste = this.studentSuivis().filter(
      s => Number(s.sourate_id) === sourate.id
    );

    // دمج الآيات المتداخلة باش ما يكونش التكرار
    const intervals: [number, number][] = [];

    for (const s of liste) {
      const debut = Math.max(1, Number(s.ayat_debut) || 1);
      const fin = Math.min(nbAyat, Number(s.ayat_fin) || 0);

      if (fin >= debut && fin >= 1) {
        intervals.push([debut, fin]);
      }
    }

    intervals.sort((a, b) => a[0] - b[0]);

    let ayatEnCours = 0;
    let start = 0;
    let end = 0;
    let initialized = false;

    for (const [a, b] of intervals) {
      if (!initialized) {
        start = a;
        end = b;
        initialized = true;
      } else if (a <= end + 1) {
        end = Math.max(end, b);
      } else {
        ayatEnCours += end - start + 1;
        start = a;
        end = b;
      }
    }

    if (initialized) {
      ayatEnCours += end - start + 1;
    }

    ayatEnCours = Math.min(ayatEnCours, nbAyat);

    const ayatBa9iya = Math.max(0, nbAyat - ayatEnCours);

    return {
      id: sourate.id,
      nom: sourate.nom,
      nom_arabe: sourate.nom_arabe,
      nbAyat,
      ayatDebut: 1,
      ayatFin: ayatEnCours,
      ayatEnCours,
      pourcentage: Math.round((ayatEnCours / nbAyat) * 100),
      ayatBa9iya
    } as SourateEnCours & { ayatBa9iya: number };
  }

  return null;
}

/* إحصائيات السورة الجاري حفظها فقط */
getCurrentSourateStats() {
  const current = this.getSourateEnCours();

  if (!current) {
    return null;
  }

  const total = current.nbAyat;
  const enCours = current.ayatEnCours;
  const remaining = Math.max(0, total - enCours);

  return {
    total,
    achieved: 0,
    enCours,
    remaining,
    percentAchieved: 0,
    percentEnCours: total > 0
      ? Math.round((enCours / total) * 100)
      : 0,
    percent: total > 0
      ? Math.round((enCours / total) * 100)
      : 0
  };
}

/* Donut خاص بالسورة الحالية */
getCurrentSourateDonutGradient(): string {
  const stats = this.getCurrentSourateStats();

  if (!stats || stats.total === 0) {
    return '#E5E7EB';
  }

  const p = (stats.enCours / stats.total) * 100;

  return `conic-gradient(
    #1B6FA8 0% ${p}%,
    #E5E7EB ${p}% 100%
  )`;
}

private normalizeStatus(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}
  /* =====================================================
     DONUT GRADIENT - 3 COULEURS
  ===================================================== */

  getHifdDonutGradient(): string {
    const stats = this.getHifdAyatStats();

    const p1 = stats.total > 0
      ? (stats.achieved / stats.total) * 100
      : 0;

    const p2 = stats.total > 0
      ? p1 + (stats.enCours / stats.total) * 100
      : 0;

    return `conic-gradient(
      #1D9E75 0% ${p1}%,
      #1B6FA8 ${p1}% ${p2}%,
      #E5E7EB ${p2}% 100%
    )`;
  }

  /* =====================================================
     NOMBRE DE SOURATES SUIVIES
  ===================================================== */

  getStudentHifdTotal(): number {
    return new Set(
      this.studentSuivis().map(s => s.sourate_id)
    ).size;
  }

  getStudentHifdCompletees(): number {
    return new Set(
      this.studentSuivis()
        .filter(s => s.statut === 'مكتمل')
        .map(s => s.sourate_id)
    ).size;
  }

  /* =====================================================
     SOURATE MAP
  ===================================================== */

  isSourateCompletee(sourateId: number): boolean {
    return this.studentSuivis().some(
      s =>
        s.sourate_id === sourateId &&
        s.statut === 'مكتمل'
    );
  }

  isSourateEnCours(sourateId: number): boolean {
    return this.studentSuivis().some(
      s =>
        s.sourate_id === sourateId &&
        (
          s.statut === 'جاري' ||
          s.statut === 'مراجعة'
        )
    );
  }


  /* =====================================================
     COULEURS DES GROUPES
  ===================================================== */

  getGroupeColor(type: string | undefined): string {
    const couleurs: Record<string, string> = {
      'أطفال': '#1B6FA8',
      'كبار': '#1D9E75',
      'نساء': '#9B59B6',
      'رجال': '#D9A441',
      'مبتدئين': '#D85A30'
    };

    return couleurs[type || ''] || '#1B6FA8';
  }

  /* =====================================================
     BAR WIDTH
  ===================================================== */

  getBarWidth(value: number, max: number): number {
    if (!max || max <= 0) {
      return 0;
    }

    return Math.min(
      100,
      Math.max(0, (Number(value) / max) * 100)
    );
  }

  getMaxEtudiants(): number {
    return Math.max(
      1,
      ...this.groupes().map(g => Number(g.nbEtudiants) || 0)
    );
  }

  /* =====================================================
     PROGRESSION GENERALE DES SOURATES
  ===================================================== */

  progressionSourates(): SourateProgression[] {

  const suivis = this.allSuivis();
  const sourates = this.allSourates();

  return sourates
    .map(s => {

      const liste = suivis.filter(
        suivi => suivi.sourate_id === s.id
      );

      // آخر statut لكل طالب فقط (بلا تكرار)
      const parEtudiant = new Map<string, any>();

      liste.forEach(l => {
        const existing = parEtudiant.get(l.etudiant_id);
        if (
          !existing ||
          new Date(l.updated_at) > new Date(existing.updated_at)
        ) {
          parEtudiant.set(l.etudiant_id, l);
        }
      });

      const uniques = Array.from(parEtudiant.values());

      return {
        id: s.id,
        nom: s.nom,
        total: uniques.length,
        completees: uniques.filter(h => h.statut === 'مكتمل').length,
        enCours: uniques.filter(
          h => h.statut === 'جاري' || h.statut === 'مراجعة'
        ).length
      };
    })
    .filter(s => s.total > 0);
}
}