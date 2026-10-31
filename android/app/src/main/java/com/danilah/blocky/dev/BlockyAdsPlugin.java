package com.danilah.blocky.dev;

import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.yandex.mobile.ads.banner.BannerAdView;
import com.yandex.mobile.ads.banner.BannerAdSize;
import com.yandex.mobile.ads.banner.BannerAdEventListener;
import com.yandex.mobile.ads.common.*;
import com.yandex.mobile.ads.interstitial.*;
import com.yandex.mobile.ads.rewarded.*;
import org.json.JSONArray;
import org.json.JSONObject;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.graphics.Insets;
import java.util.UUID;

@CapacitorPlugin(name = "BlockyAds")
public class BlockyAdsPlugin extends Plugin {
  private static final long RETRY = 60000L;
  private final Handler handler = new Handler(Looper.getMainLooper());
  private SharedPreferences prefs;
  private boolean initialized, destroyed, resumed = true, loadingInterstitial, loadingRewarded;
  private long lastInterstitialRequest, lastRewardedRequest, lastBannerRequest;
  private InterstitialAdLoader interstitialLoader;
  private RewardedAdLoader rewardedLoader;
  private InterstitialAd interstitial;
  private RewardedAd rewarded;
  private BannerAdView banner;
  private FrameLayout bannerHost;
  private int bannerWidth;
  private PluginCall showing;
  private String showingKind, showingAttempt;
  private boolean shown;
  private int epoch=0;
  private Runnable showDeadline;

  @Override public void load() {
    prefs = getContext().getSharedPreferences("blocky-ads-v1", 0);
    getActivity().runOnUiThread(() -> {
      YandexAds.initialize(getContext(), () -> getActivity().runOnUiThread(() -> {
        if (destroyed) return;
        initialized = true;
        interstitialLoader = new InterstitialAdLoader(getContext());
        rewardedLoader = new RewardedAdLoader(getContext());
        preloadAds();
        notifyListeners("geometryChanged",new JSObject(),true);
      }));
    });
  }
  private boolean enabled() { return getContext().getResources().getBoolean(R.bool.ads_test_mode) || !getContext().getString(R.string.yandex_banner_id).isEmpty(); }
  private String unit(String kind) {
    boolean test = getContext().getResources().getBoolean(R.bool.ads_test_mode);
    if (test) return "demo-" + kind + "-yandex";
    return getContext().getString(kind.equals("banner") ? R.string.yandex_banner_id : kind.equals("rewarded") ? R.string.yandex_rewarded_id : R.string.yandex_interstitial_id);
  }
  private void event(String name,String kind) { android.util.Log.d("BlockyAds",name+":"+kind); }
  private JSONArray receipts() {
    try { return new JSONArray(prefs.getString("receipts", "[]")); } catch(Exception e) { throw new IllegalStateException("Damaged receipts",e); }
  }
  @PluginMethod public void initialize(PluginCall call) { call.resolve(new JSObject().put("enabled",enabled())); }
  @PluginMethod public void status(PluginCall call) {getActivity().runOnUiThread(()->{try{call.resolve(new JSObject().put("rewarded",rewarded!=null && receipts().length()==0 && showing==null).put("interstitial",interstitial!=null && showing==null));}catch(Exception e){call.reject("Ad state unavailable");}});}
  @PluginMethod public void pending(PluginCall call) { getActivity().runOnUiThread(()->{try{call.resolve(new JSObject().put("rewards",receipts()));}catch(Exception e){call.reject("Cannot read receipts");}}); }
  @PluginMethod public void acknowledge(PluginCall call) {getActivity().runOnUiThread(()->{
    try {JSONArray next=new JSONArray(), all=receipts();String id=call.getString("id","");
      for(int i=0;i<all.length();i++)if(!id.equals(all.getJSONObject(i).getString("id")))next.put(all.get(i));
      if(!prefs.edit().putString("receipts",next.toString()).commit()){call.reject("Cannot acknowledge reward");return;}
      call.resolve();
    }catch(Exception e){call.reject("Cannot acknowledge reward");}
  });}
  @PluginMethod public void preload(PluginCall call) { getActivity().runOnUiThread(this::preloadAds); call.resolve(); }
  private void preloadAds() {
    if (!initialized || destroyed || !enabled() || !resumed) return;
    long now = SystemClock.elapsedRealtime();
    if (interstitial == null && !loadingInterstitial && (lastInterstitialRequest == 0 || now - lastInterstitialRequest >= RETRY)) {
      loadingInterstitial = true; lastInterstitialRequest = now; event("ad_request", "interstitial");
      interstitialLoader.loadAd(new AdRequest.Builder(unit("interstitial")).build(), new InterstitialAdLoadListener() {
        @Override public void onAdLoaded(@NonNull InterstitialAd ad) {
          loadingInterstitial = false; if (!destroyed) { interstitial = ad; event("ad_loaded", "interstitial"); }
        }
        @Override public void onAdFailedToLoad(@NonNull AdRequestError error) { loadingInterstitial = false; event("ad_load_error", "interstitial"); }
      });
    }
    if (rewarded == null && !loadingRewarded && (lastRewardedRequest == 0 || now - lastRewardedRequest >= RETRY)) {
      loadingRewarded = true; lastRewardedRequest = now; event("ad_request", "rewarded");
      rewardedLoader.loadAd(new AdRequest.Builder(unit("rewarded")).build(), new RewardedAdLoadListener() {
        @Override public void onAdLoaded(@NonNull RewardedAd ad) {
          loadingRewarded = false; if (!destroyed) { rewarded = ad; event("ad_loaded", "rewarded"); notifyListeners("ready",new JSObject(),true); }
        }
        @Override public void onAdFailedToLoad(@NonNull AdRequestError error) { loadingRewarded = false; event("ad_load_error", "rewarded"); }
      });
    }
  }
  @PluginMethod public void show(PluginCall call) { getActivity().runOnUiThread(() -> {try{showOnMain(call);}catch(Exception e){call.reject("Ad state unavailable");}}); }
  private void showOnMain(PluginCall call) {
    String kind = call.getString("kind", "");
    if (!kind.equals("rewarded") && !kind.equals("interstitial")) { call.reject("Invalid format"); return; }
    if (destroyed || !resumed || showing != null || !initialized || !enabled()) { call.resolve(new JSObject().put("status", "unavailable")); return; }
    if (kind.equals("interstitial") && interstitial == null) { call.resolve(new JSObject().put("status","unavailable"));preloadAds();return; }
    if (kind.equals("rewarded") && (rewarded == null || receipts().length()>0 || call.getString("intentId", "").isEmpty())) {
      call.resolve(new JSObject().put("status","unavailable").put("rewards",receipts()));preloadAds();return;
    }
    showing = call; showingKind = kind; showingAttempt = call.getString("intentId", ""); shown = false;
    if (bannerHost != null) bannerHost.setVisibility(View.GONE);
    // A missing pre-show callback must not leave the game blocked indefinitely.
    showDeadline = () -> { if (!shown && showing == call) finish("error"); };
    handler.postDelayed(showDeadline, 15000);
    try {
      if (kind.equals("interstitial")) {
        interstitial.setAdEventListener(new InterstitialAdEventListener() {
          @Override public void onAdShown() { if (showing == call) didShow(); }
          @Override public void onAdDismissed() { if (showing == call) finish("closed"); }
          @Override public void onAdFailedToShow(@NonNull AdError e) { if (showing == call) finish("error"); }
          @Override public void onAdClicked() { event("ad_clicked", "interstitial"); }
          @Override public void onAdImpression(@Nullable ImpressionData data) { event("ad_impression", "interstitial"); }
        });
        interstitial.show(getActivity());
      } else {
        final String intentId = showingAttempt;
        rewarded.setAdEventListener(new RewardedAdEventListener() {
          private boolean issued=false;
          @Override public void onAdShown() { if (showing == call) didShow(); }
          @Override public void onAdDismissed() { if (showing == call) finish("closed"); }
          @Override public void onAdFailedToShow(@NonNull AdError e) { if (showing == call) finish("error"); }
          @Override public void onAdClicked() { event("ad_clicked", "rewarded"); }
          @Override public void onAdImpression(@Nullable ImpressionData data) { event("ad_impression", "rewarded"); }
          @Override public void onRewarded(@NonNull Reward reward) {
            if (issued || destroyed) return;
            try {
              JSONArray all=receipts();
              JSObject receipt=new JSObject().put("id",UUID.randomUUID().toString()).put("intentId",intentId);
              all.put(receipt);
              if(prefs.edit().putString("receipts",all.toString()).commit()) {
                issued=true;event("ad_reward_earned","rewarded");notifyListeners("reward",receipt,true);
              } else notifyListeners("receiptError",new JSObject(),true);
            } catch(Exception e) {notifyListeners("receiptError",new JSObject(),true);}

          }
        });
        rewarded.show(getActivity());
      }
    } catch (Exception e) { finish("error"); }
  }
  private void didShow() {
    if (showing == null) return;
    shown = true; handler.removeCallbacks(showDeadline);
    event("ad_shown", showingKind);
  }
  private void finish(String status) {
    if (showing == null) return;
    handler.removeCallbacks(showDeadline);
    JSObject result = new JSObject().put("shown", shown).put("status", status);
    if (showingKind.equals("rewarded")) result.put("rewards", receipts());
    event(status.equals("error") ? "ad_show_error" : "ad_closed", showingKind);
    if (showingKind.equals("rewarded")) { if (rewarded != null) rewarded.setAdEventListener(null); rewarded = null; lastRewardedRequest = 0; }
    else { if (interstitial != null) interstitial.setAdEventListener(null); interstitial = null; lastInterstitialRequest = 0; }
    PluginCall call = showing; showing = null; showingAttempt = null; call.resolve(result);
    preloadAds();
  }
  private void clearBanner() {
    if (banner != null) { banner.setBannerAdEventListener(null); banner.destroy(); banner = null; }
    if (bannerHost != null) { if (bannerHost.getParent() instanceof ViewGroup) ((ViewGroup)bannerHost.getParent()).removeView(bannerHost); bannerHost = null; }
    bannerWidth = 0;
  }
  @PluginMethod public void geometry(PluginCall call) {getActivity().runOnUiThread(()->{
    View web=getBridge().getWebView();FrameLayout root=getActivity().findViewById(android.R.id.content);
    int[] wl=new int[2],rl=new int[2];web.getLocationOnScreen(wl);root.getLocationOnScreen(rl);
    double vw=call.getDouble("viewportWidth",0d),cw=call.getDouble("width",0d);
    if(!initialized || vw<=0 || cw<=0 || web.getWidth()<=0){call.reject("Geometry unavailable");return;}
    int width=(int)Math.floor(cw*web.getWidth()/vw);
    int dp=(int)Math.floor(width/getContext().getResources().getDisplayMetrics().density);
    if(dp<=0){call.reject("Invalid width");return;}
    BannerAdSize size=BannerAdSize.sticky(getContext(),dp);
    WindowInsetsCompat wi=ViewCompat.getRootWindowInsets(root);
    Insets in=wi==null?Insets.NONE:wi.getInsets(WindowInsetsCompat.Type.systemBars()|WindowInsetsCompat.Type.displayCutout());
    // Insets are window-relative; content root may already exclude system bars.
    // Convert exclusions into root coordinates instead of subtracting bars twice.
    View decor=getActivity().getWindow().getDecorView();int[] dl=new int[2];decor.getLocationOnScreen(dl);
    int safeLeft=Math.max(0,dl[0]+in.left-rl[0]),safeTop=Math.max(0,dl[1]+in.top-rl[1]);
    int safeRight=Math.max(0,rl[0]+root.getWidth()-(dl[0]+decor.getWidth()-in.right));
    int safeBottom=Math.max(0,rl[1]+root.getHeight()-(dl[1]+decor.getHeight()-in.bottom));
    JSObject geometry=new JSObject().put("webView",new JSObject().put("x",wl[0]-rl[0]).put("y",wl[1]-rl[1]).put("width",web.getWidth()).put("height",web.getHeight()))
      .put("root",new JSObject().put("width",root.getWidth()).put("height",root.getHeight()))
      .put("safeInsets",new JSObject().put("left",safeLeft).put("top",safeTop).put("right",safeRight).put("bottom",safeBottom))
      .put("parentPadding",new JSObject().put("left",root.getPaddingLeft()).put("top",root.getPaddingTop()))
      .put("adHeight",size.getHeightInPixels(getContext()));
    call.resolve(new JSObject().put("geometry",geometry).put("epoch",epoch));
  });}
  @PluginMethod public void banner(PluginCall call) {getActivity().runOnUiThread(()->{
    if(!call.getBoolean("visible",false)||!initialized||destroyed||!enabled()||showing!=null||!resumed||call.getInt("epoch",-1)!=epoch){if(bannerHost!=null)bannerHost.setVisibility(View.GONE);call.resolve();return;}
    FrameLayout root=getActivity().findViewById(android.R.id.content);
    int x=call.getInt("x",-1),y=call.getInt("y",-1),w=call.getInt("width",0),h=call.getInt("height",0);
    if(x<0||y<0||w<=0||h<=0||x+w>root.getWidth()||y+h>root.getHeight()){if(bannerHost!=null)bannerHost.setVisibility(View.GONE);call.resolve();return;}
    int dp=(int)Math.floor(w/getContext().getResources().getDisplayMetrics().density);BannerAdSize size=BannerAdSize.sticky(getContext(),dp);
    if(size.getHeightInPixels(getContext())>h){if(bannerHost!=null)bannerHost.setVisibility(View.GONE);call.resolve();return;}
    if(banner!=null&&bannerWidth!=w){clearBanner();lastBannerRequest=0;}
    if(banner==null){
      long now=SystemClock.elapsedRealtime();if(lastBannerRequest!=0&&now-lastBannerRequest<RETRY){call.resolve();return;}
      lastBannerRequest=now;bannerWidth=w;
      bannerHost=new FrameLayout(getContext());root.addView(bannerHost);
      banner=new BannerAdView(getActivity());banner.setAdSize(size);
      bannerHost.addView(banner,new FrameLayout.LayoutParams(w,h,android.view.Gravity.CENTER));
      final BannerAdView current=banner;
      banner.setBannerAdEventListener(new BannerAdEventListener(){
        @Override public void onAdLoaded(){if(banner==current)event("ad_loaded","banner");}
        @Override public void onAdFailedToLoad(@NonNull AdRequestError e){if(banner==current){clearBanner();event("ad_load_error","banner");}}
        @Override public void onAdClicked(){event("ad_clicked","banner");}
        @Override public void onImpression(@Nullable ImpressionData d){event("ad_impression","banner");}
      });
      banner.loadAd(new AdRequest.Builder(unit("banner")).build());
    }
    if(bannerHost!=null){FrameLayout.LayoutParams lp=new FrameLayout.LayoutParams(w,h);lp.leftMargin=x-root.getPaddingLeft();lp.topMargin=y-root.getPaddingTop();android.view.ViewGroup.LayoutParams previous=bannerHost.getLayoutParams(); if(!(previous instanceof FrameLayout.LayoutParams) || previous.width!=w || previous.height!=h || ((FrameLayout.LayoutParams)previous).leftMargin!=lp.leftMargin || ((FrameLayout.LayoutParams)previous).topMargin!=lp.topMargin) bannerHost.setLayoutParams(lp);bannerHost.setVisibility(View.VISIBLE);}
    call.resolve();
  });}
  @Override protected void handleOnConfigurationChanged(Configuration config){epoch++;clearBanner();lastBannerRequest=0;notifyListeners("geometryChanged",new JSObject(),true);}
  @Override protected void handleOnPause() { resumed = false; if (bannerHost != null) bannerHost.setVisibility(View.GONE); }
  @Override protected void handleOnResume() { resumed = true; preloadAds(); notifyListeners("geometryChanged",new JSObject(),true); }
  @Override protected void handleOnDestroy() {
    destroyed = true; handler.removeCallbacksAndMessages(null); clearBanner();
    if (interstitial != null) interstitial.setAdEventListener(null);
    if (rewarded != null) rewarded.setAdEventListener(null);
    if (showing != null) { showing.resolve(new JSObject().put("status", "interrupted")); showing = null; }
  }
}

