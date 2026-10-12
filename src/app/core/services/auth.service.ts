import { Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Router } from '@angular/router';

@Injectable({ providedIn: 'root' })
export class AuthService {

  currentUser = signal<any>(null);

  constructor(
    private sb: SupabaseService,
    private router: Router
  ) {
    this.sb.client.auth.onAuthStateChange(async (event, session) => {

      if (session?.user) {
        await this.loadProfile(session.user.id);
      } else {
        this.currentUser.set(null);
      }

    });
  }

  // ── Login ──────────────────────────────────────
  async login(email: string, password: string) {

    const { data, error } =
      await this.sb.client.auth.signInWithPassword({
        email,
        password
      });

    if (error) {
      throw error;
    }

    if (data.user) {

      await this.loadProfile(data.user.id);

      this.redirectByRole();
    }

    return data;
  }


  // ── Logout ─────────────────────────────────────
  async logout() {

    await this.sb.client.auth.signOut();

    this.currentUser.set(null);

    await this.router.navigate(['/login'], { replaceUrl: true });
  }

  // ── Charger le profil ──────────────────────────
  async loadProfile(userId: string) {

    const { data, error } =
      await this.sb.client
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

    if (error) {

      console.error(
        '❌ PROFILE ERROR:',
        error.message
      );

      return null;
    }

    if (!data) {

      console.warn(
        '⚠️ Aucun profil trouvé pour:',
        userId
      );

      this.currentUser.set(null);

      return null;
    }

    console.log(
      '✅ PROFILE LOADED:',
      data
    );

    this.currentUser.set(data);

    return data;
  }

  // ── Redirection selon le rôle ──────────────────
  private redirectByRole() {

    const role = this.currentUser()?.role;

    console.log('ROLE:', role);

    if (role === 'prof') {

      this.router.navigate([
        '/prof/dashboard'
      ]);

    } else if (role === 'etudiant') {

      this.router.navigate([
        '/etudiant/dashboard'
      ]);

    } else {

      console.warn(
        '⚠️ Rôle inconnu:',
        role
      );
    }
  }

  // ── Getters ────────────────────────────────────

  get role() {
    return this.currentUser()?.role;
  }

  isLoggedIn() {
    return !!this.currentUser();
  }

  isProf() {
    return this.currentUser()?.role === 'prof';
  }

  isEtudiant() {
    return this.currentUser()?.role === 'etudiant';
  }
}
