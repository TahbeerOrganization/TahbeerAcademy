import { Component, signal } from '@angular/core';// signal : système réactif d'Angular 17 (comme useState en React)
import { CommonModule } from '@angular/common'; // CommonModule : donne accès aux directives @if, @for dans le HTML
import { FormsModule } from '@angular/forms';// FormsModule : permet d'utiliser ngModel (liaison données formulaire)
import { Router, RouterLink } from '@angular/router';// Router : pour naviguer entre pages programmatiquement / RouterLink : directive pour les liens de navigation dans le HTML
import { AuthService } from '../../../../core/services/auth.service';// AuthService : notre service qui gère login/logout avec Supabase


@Component({
  selector: 'app-login',
  imports: [CommonModule,FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  // ── Signals (état local du composant) ─────────
  // signal() = variable réactive : quand elle change, le HTML se met à jour automatiquement
  email = signal('');
  password = signal('');
  loading = signal(false);
  error = signal('');
  showPassword = signal(false);

  // ── Injection des dépendances ──────────────────
  constructor(
    private auth: AuthService,
    private router: Router
  ){}


  // ── Méthode de connexion ───────────────────────
  async onLogin() {
  if (!this.email() || !this.password()) {
    this.error.set('يرجى ملء جميع الحقول');
    return;
  }

  this.loading.set(true);
  this.error.set('');

  try {
    await this.auth.login(this.email(), this.password());
    // ✅ Pas besoin de navigate ici — AuthService redirige automatiquement
  } catch (err: any) {
    this.error.set('البريد الإلكتروني أو كلمة المرور غير صحيحة');
  } finally {
    this.loading.set(false);
  }
}
  // ── Toggle affichage mot de passe ─────────────
  togglePassword() {
    // update() = inverse la valeur actuelle du signal
    this.showPassword.update(v => !v);
  }

}
