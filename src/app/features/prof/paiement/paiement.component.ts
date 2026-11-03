
import { Component, computed, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { SupabaseService } from '../../../core/services/supabase.service';

interface Etudiant {
  id: string;
  nom: string;
}

interface Paiement {
  id: string;
  etudiant_id: string;
  mois: number;
  annee: number;
  montant: number;
  paye: boolean;
  date_paiement?: string;
}

@Component({
  selector: 'app-paiements',
  standalone: true,
  imports: [CommonModule, SidebarComponent],
  templateUrl: './paiement.component.html',
  styleUrl: './paiement.component.css'
})
export class PaiementComponent implements OnInit {

  constructor(
    private route: ActivatedRoute,
    private sb: SupabaseService
  ) {}

  // STATE

  loading = signal(false);
  saving = signal(false);

  filtreEtudiant = signal('');
  annee = signal(new Date().getFullYear());

  etudiants = signal<Etudiant[]>([]);
  paiements = signal<Paiement[]>([]);

  // MOIS

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

  // INIT

  ngOnInit(): void {

    this.route.queryParams.subscribe(params => {

      const etudiantId = params['etudiant'];

      this.filtreEtudiant.set(
        etudiantId ? String(etudiantId) : ''
      );

      this.loadData();

    });

  }

  // LOAD DATA

  async loadData() {

    this.loading.set(true);

    try {

      await this.loadEtudiants();

      if (this.filtreEtudiant()) {
        await this.loadPaiements();
      } else {
        this.paiements.set([]);
      }

    } catch (error) {

      console.error('❌ LOAD DATA:', error);

    } finally {

      this.loading.set(false);

    }

  }

  // LOAD ETUDIANTS

  async loadEtudiants() {

    const { data, error } = await this.sb.client
      .from('profiles')
      .select('id, nom')
      .eq('role', 'etudiant')
      .order('nom');

    if (error) {

      console.error('❌ ETUDIANTS:', error);
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

  // LOAD PAIEMENTS DU ETUDIANT ET ANNEE

  async loadPaiements() {

    const etudiantId = this.filtreEtudiant();

    if (!etudiantId) {
      this.paiements.set([]);
      return;
    }

    const { data, error } = await this.sb.client
      .from('paiements')
      .select('*')
      .eq('etudiant_id', etudiantId)
      .eq('annee', this.annee())
      .order('mois');

    if (error) {

      console.error('❌ PAIEMENTS:', error);
      this.paiements.set([]);
      return;

    }

    this.paiements.set(
      (data || []).map((p: any) => ({
        id: String(p.id),
        etudiant_id: String(p.etudiant_id),
        mois: Number(p.mois),
        annee: Number(p.annee),
        montant: Number(p.montant || 0),
        paye: Boolean(p.paye),
        date_paiement: p.date_paiement || undefined
      }))
    );

  }

  // CHANGER ETUDIANT

  async changerEtudiant(value: string) {

    this.filtreEtudiant.set(value);
    this.paiements.set([]);

    if (!value) return;

    await this.loadPaiements();

  }

  // ETUDIANT SELECTIONNE

  etudiantSelectionne = computed(() => {

    const id = this.filtreEtudiant();

    return this.etudiants().find(e => e.id === id);

  });

  // PAIEMENTS ETUDIANT

  paiementsEtudiant = computed(() => {

    const etudiantId = this.filtreEtudiant();
    const annee = this.annee();

    return this.paiements().filter(p =>
      p.etudiant_id === etudiantId &&
      p.annee === annee
    );

  });

  
  // EST PAYE

  estPaye(mois: number): boolean {

    return this.paiementsEtudiant().some(
      p => p.mois === mois && p.paye
    );

  }

  // GET PAIEMENT

  getPaiement(mois: number): Paiement | undefined {

    return this.paiementsEtudiant().find(
      p => p.mois === mois
    );

  }

  // CHANGER ET ENREGISTRER PAIEMENT

  async changerPaiement(mois: number, paye: boolean) {

    const etudiantId = this.filtreEtudiant();

    if (!etudiantId || this.saving()) return;

    this.saving.set(true);

    try {

      const datePaiement = paye
        ? new Date().toISOString().slice(0, 10)
        : null;

      const { error } = await this.sb.client
        .from('paiements')
        .upsert(
          {
            etudiant_id: etudiantId,
            mois: mois,
            annee: this.annee(),
            montant: 0,
            paye: paye,
            date_paiement: datePaiement
          },
          {
            onConflict: 'etudiant_id,mois,annee'
          }
        );

      if (error) {

        console.error('❌ SAVE PAIEMENT:', error);
        alert('تعذر تسجيل الأداء. حاول مرة أخرى.');
        return;

      }

      await this.loadPaiements();

    } catch (error) {

      console.error('❌ SAVE:', error);

    } finally {

      this.saving.set(false);

    }

  }

  // CHANGER ANNEE

  async changerAnnee(value: string) {

    this.annee.set(Number(value));

    await this.loadPaiements();

  }

  // FORMAT MONEY

  formatMoney(amount: number): string {

    return `${amount} DH`;

  }

}
