import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { SupabaseService } from '../services/supabase.service';

export const authGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthService);
  const sb = inject(SupabaseService);
  const router = inject(Router);

  // نتأكدو من session الحقيقية ف Supabase (ماشي غير currentUser signal
  // لي ممكن يكون مازال null ف أول تحميل للصفحة قبل ما onAuthStateChange يخدم)
  const { data } = await sb.client.auth.getSession();

  if (!data.session) {
    router.navigate(['/login']);
    return false;
  }

  // نتأكدو بلي profile محمل (ممكن session كاينة بصح profile مازال كايتحمل)
  if (!auth.currentUser()) {
    await auth.loadProfile(data.session.user.id);
  }

  // تحقق من الدور (role) إلا كانت route محتاجة دور معين
  const requiredRole = route.data?.['role'] as string | undefined;

  if (requiredRole && auth.role !== requiredRole) {
    router.navigate(['/login']);
    return false;
  }

  return true;
};