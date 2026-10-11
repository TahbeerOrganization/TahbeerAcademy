import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login/login/login.component')
        .then(m => m.LoginComponent)
  },

  // ── Prof ───────────────────────────────────────
  {
    path: 'prof',
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/prof/dashboard/dashboard.component')
            .then(m => m.DashboardComponent)
      },
      {
        path: 'etudiants',
        loadComponent: () =>
          import('./features/prof/etudiants/etudiants.component')
            .then(m => m.EtudiantsComponent)
      },
      {
        path: 'presences',
        loadComponent: () =>
          import('./features/prof/presences/presences.component')
            .then(m => m.PresencesComponent)
      },
      
      {
        path: 'devoirs',
        loadComponent: () =>
          import('./features/prof/devoirs/devoirs.component')
            .then(m => m.DevoirsComponent)
      },
      {
        path: 'groupes',
        loadComponent: () =>
          import('./features/prof/groupes/groupes.component')
            .then(m => m.GroupesComponent)
      },
      {
        path: 'hifd',
        loadComponent: () =>
          import('./features/prof/hifd/hifd.component')
            .then(m => m.HifdComponent)
      },
      
      {
        path: 'rapports',
        loadComponent: () =>
          import('./features/prof/rapports/rapports.component')
            .then(m => m.RapportsComponent)
      },
      {
        path: 'emploi',
        loadComponent: () =>
          import('./features/prof/emploi/emploi.component')
            .then(m => m.EmploiComponent)
      },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' }
    ]
  },

  // ── Etudiant ───────────────────────────────────
  {
    path: 'etudiant',
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/etudiant/dashboard/dashboard.component')
            .then(m => m.DashboardComponent)
      },
      
      {
        path: 'mes-cours',
        loadComponent: () =>
          import('./features/etudiant/mes-cours/mes-cours.component')
            .then(m => m.MesCoursComponent)
      },
      {
        path: 'mes-notifications',
        loadComponent: () =>
          import('./features/etudiant/mes-notifications/mes-notifications.component')
            .then(m => m.MesNotificationsComponent)
      },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' }
    ]
  },

  { path: '**', redirectTo: 'login' }
];