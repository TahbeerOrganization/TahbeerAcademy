import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'TahbeerFrontend';
}

  // ف ngOnInit ديال AppComponent
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    // الصفحة طلعت من bfcache — نعاودو نشيكيو السيشن
    window.location.reload();
  }
});