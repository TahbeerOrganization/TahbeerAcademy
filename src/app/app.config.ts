import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { registerLocaleData } from '@angular/common';
import localeArMA from '@angular/common/locales/ar-MA';
import {  LOCALE_ID } from '@angular/core';

registerLocaleData(localeArMA, 'ar-MA');

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
  { provide: LOCALE_ID, useValue: 'ar-MA' },]
};


