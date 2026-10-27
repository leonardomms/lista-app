package br.com.listadafeira;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

/**
 * Edge-to-edge igual no Android 13, 14 e 15: a janela desenha atrás das barras do sistema e o app
 * se afasta delas com padding (barra de status, de navegação e teclado). O Capacitor não mexe nos
 * insets (SystemBars.insetsHandling = "disable" no capacitor.config.json), então o WebView recebe
 * env(safe-area-inset-*) = 0 e a página não soma o espaço duas vezes.
 */
public class MainActivity extends BridgeActivity {
    private static final int BG = 0xFF0A0A0B;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= 29) window.setNavigationBarContrastEnforced(false);

        View decor = window.getDecorView();
        decor.setBackgroundColor(BG);   // é o que aparece atrás das barras

        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, decor);
        controller.setAppearanceLightStatusBars(false);       // ícones claros no fundo escuro
        controller.setAppearanceLightNavigationBars(false);

        ViewCompat.setOnApplyWindowInsetsListener(decor, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            boolean keyboard = insets.isVisible(WindowInsetsCompat.Type.ime());
            v.setPadding(bars.left, bars.top, bars.right, keyboard ? ime.bottom : bars.bottom);
            // zera o que já foi aplicado como padding, para o WebView não aplicar de novo
            return new WindowInsetsCompat.Builder(insets)
                .setInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout(), Insets.NONE)
                .build();
        });
    }
}
