import { Component, computed, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { SupabaseService } from '../../../core/services/supabase.service';

interface Etudiant {
  id: string;
  nom: string;
}

interface Programme {
  id: string;
  nom: string;
}

interface Paiement {
  id: string;
  etudiant_id: string;
  programme_id: string;
  mois: number;
  annee: number;
  montant: number;
  paye: boolean;
  date_paiement?: string;
}

@Component({
  selector: 'app-paiements',
  standalone: true,
  imports: [
    CommonModule,
    SidebarComponent
  ],
  templateUrl: './paiement.component.html',
  styleUrl: './paiement.component.css'
})
export class PaiementComponent implements OnInit {

  constructor(
    private route: ActivatedRoute,
    private sb: SupabaseService
  ) {}

  /* ==============================
     STATE
  ============================== */

  loading = signal(false);
  saving = signal(false);

  filtreEtudiant = signal('');
  annee = signal(new Date().getFullYear());

  etudiants = signal<Etudiant[]>([]);
  programmes = signal<Programme[]>([]);
  paiements = signal<Paiement[]>([]);

 

  /* ==============================
     MOIS
  ============================== */

  mois = [
    { id: 1, nom: 'يناير' },
    { id: 2, nom: 'فبراير' },
    { id: 3, nom: 'مارس' },
    { id: 4, nom: 'أبريل' },
    { id: 5, nom: 'ماي' },
    { id: 6, nom: 'يونيو' },
    { id: 7, nom: 'يوليوز' },
    { id: 8, nom: 'غشت' },
    { id: 9, nom: 'شتنبر' },
    { id: 10, nom: 'أكتوبر' },
    { id: 11, nom: 'نونبر' },
    { id: 12, nom: 'دجنبر' }
  ];

  /* ==============================
     PROGRAMMES DE L'ETUDIANT
  ============================== */

  programmesEtudiant = signal<Programme[]>([]);

  /* ==============================
     PROGRAMME SELECTIONNE
  ============================== */

  programmeSelectionne = signal('');

  /* ==============================
     INIT
  ============================== */

  ngOnInit(): void {

    this.route.queryParams.subscribe(params => {

      const etudiantId = params['etudiant'];

      if (etudiantId) {
        this.filtreEtudiant.set(String(etudiantId));
      }

      this.loadData();

    });

  }

  /* ==============================
     LOAD DATA
  ============================== */

  async loadData() {

    this.loading.set(true);

    try {

      await this.loadEtudiants();
      await this.loadPaiements();

      if (this.filtreEtudiant()) {
        await this.loadProgrammesEtudiant(
          this.filtreEtudiant()
        );
      }

    } catch (error) {

      console.error('❌ LOAD DATA:', error);

    } finally {

      this.loading.set(false);

    }

  }

  /* ==============================
     LOAD ETUDIANTS
  ============================== */

  async loadEtudiants() {

    const { data, error } =
      await this.sb.client
        .from('profiles')
        .select('id, nom')
        .eq('role', 'etudiant')
        .order('nom');

    if (error) {

      console.error(
        '❌ ETUDIANTS:',
        error
      );

      this.etudiants.set([]);
      return;

    }

    this.etudiants.set(
      (data || []).map((e: any) => ({
        id: String(e.id),
        nom: e.nom || ''
      }))
    );

  }

  /* ==============================
     LOAD PROGRAMMES ETUDIANT
  ============================== */

  async loadProgrammesEtudiant(
  etudiantId: string
) {

  if (!etudiantId) {
    this.programmesEtudiant.set([]);
    return;
  }

  console.log(
    '🔎 Recherche programmes pour étudiant:',
    etudiantId
  );

  const { data, error } =
    await this.sb.client
      .from('groupe_etudiants')
      .select(`
        groupe_id,
        groupes (
          id,
          nom,
          programme_id,
          programmes (
            id,
            nom
          )
        )
      `)
      .eq('etudiant_id', etudiantId);

  if (error) {

    console.error(
      '❌ PROGRAMMES ETUDIANT:',
      error
    );

    this.programmesEtudiant.set([]);
    return;
  }

  console.log(
    '📚 GROUPES ETUDIANT RAW:',
    data
  );

  const programmesMap =
    new Map<string, Programme>();

  for (const row of data || []) {

    const groupe: any =
      row.groupes;

    console.log(
      '👥 GROUPE:',
      groupe
    );

    if (!groupe) {
      continue;
    }

    const programme: any =
      groupe.programmes;

    console.log(
      '📚 PROGRAMME:',
      programme
    );

    if (!programme) {
      continue;
    }

    const programmeId =
      String(programme.id);

    const programmeNom =
      String(programme.nom || '');

    programmesMap.set(
      programmeId,
      {
        id: programmeId,
        nom: programmeNom,
      }
    );
  }

  const programmes =
    Array.from(
      programmesMap.values()
    );

  console.log(
    '✅ PROGRAMMES ETUDIANT FINAL:',
    programmes
  );

  this.programmesEtudiant.set(
    programmes
  );

  /*
   * إذا عندو غير programme واحد
   * نختاروه أوتوماتيكياً
   */

  if (programmes.length === 1) {

    this.programmeSelectionne.set(
      programmes[0].id
    );

  } else {

    this.programmeSelectionne.set('');

  }
}

  /* ==============================
     LOAD PAIEMENTS
  ============================== */

  async loadPaiements() {

    const { data, error } =
      await this.sb.client
        .from('paiements')
        .select('*')
        .order('annee', {
          ascending: false
        })
        .order('mois', {
          ascending: false
        });

    if (error) {

      console.error(
        '❌ PAIEMENTS:',
        error
      );

      this.paiements.set([]);
      return;

    }

    this.paiements.set(
      (data || []).map((p: any) => ({
        id: String(p.id),
        etudiant_id:
          String(p.etudiant_id),
        programme_id:
          String(p.programme_id),
        mois: Number(p.mois),
        annee: Number(p.annee),
        montant: Number(p.montant || 0),
        paye: Boolean(p.paye),
        date_paiement:
          p.date_paiement || undefined
      }))
    );

  }

  /* ==============================
     CHANGER ETUDIANT
  ============================== */

  async changerEtudiant(
    value: string
  ) {

    this.filtreEtudiant.set(value);

    this.programmeSelectionne.set('');

    this.programmesEtudiant.set([]);

    if (!value) {
      return;
    }

    await this.loadProgrammesEtudiant(
      value
    );

  }

  /* ==============================
     ETUDIANT SELECTIONNE
  ============================== */

  etudiantSelectionne =
    computed(() => {

      const id =
        this.filtreEtudiant();

      return this.etudiants().find(
        e => e.id === id
      );

    });

  /* ==============================
     PROGRAMME SELECTIONNE
  ============================== */

  programmeActuel =
    computed(() => {

      const id =
        this.programmeSelectionne();

      return this.programmesEtudiant()
        .find(p => p.id === id);

    });

  /* ==============================
     PAIEMENTS FILTRES
  ============================== */

  paiementsEtudiant =
    computed(() => {

      const etudiantId =
        this.filtreEtudiant();

      const programmeId =
        this.programmeSelectionne();

      const annee =
        this.annee();

      if (
        !etudiantId ||
        !programmeId
      ) {

        return [];

      }

      return this.paiements().filter(
        p =>
          p.etudiant_id === etudiantId &&
          p.programme_id === programmeId &&
          p.annee === annee
      );

    });

  /* ==============================
     MOIS PAYES
  ============================== */

  nombreMoisPayes =
    computed(() => {

      return this.paiementsEtudiant()
        .filter(p => p.paye)
        .length;

    });

  /* ==============================
     MOIS NON PAYES
  ============================== */

  nombreMoisNonPayes =
    computed(() => {

      return 12 -
        this.nombreMoisPayes();

    });

  /* ==============================
     TOTAL PAYE
  ============================== */

  totalPaye =
    computed(() => {

      return this.paiementsEtudiant()
        .filter(p => p.paye)
        .reduce(
          (total, p) =>
            total + p.montant,
          0
        );

    });



  /* ==============================
     EST PAYE
  ============================== */

  estPaye(
    mois: number
  ): boolean {

    return !!this.paiementsEtudiant()
      .find(
        p =>
          p.mois === mois &&
          p.paye
      );

  }

  /* ==============================
     GET PAIEMENT
  ============================== */

  getPaiement(
    mois: number
  ): Paiement | undefined {

    return this.paiementsEtudiant()
      .find(
        p =>
          p.mois === mois
      );

  }

  /* ==============================
     TOGGLE PAIEMENT
  ============================== */

  

  /* ==============================
     CHANGER ANNEE
  ============================== */

  changerAnnee(
    value: string
  ) {

    this.annee.set(
      Number(value)
    );

  }

  /* ==============================
     FORMAT MONEY
  ============================== */

  formatMoney(
    amount: number
  ): string {

    return `${amount} DH`;

  }

}