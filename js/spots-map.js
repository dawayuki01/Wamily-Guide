/* ============================================================
   spots-map.js — Google Maps スポット一覧マップ
   各国のスポットを lat/lng 座標で直接ピン表示する。
   PlacesService 不要（座標は data/*.json に格納）
   ============================================================ */

(function () {
  'use strict';

  // ── 国ごとの中心座標 & ズームレベル ──────────────────────
  var COUNTRY_CONFIG = {
    london:    { lat: 51.5074,  lng: -0.1278,   zoom: 12 },
    taipei:    { lat: 25.0330,  lng: 121.5654,  zoom: 13 },
    paris:     { lat: 48.8566,  lng: 2.3522,    zoom: 12 },
    stockholm: { lat: 59.3293,  lng: 18.0686,   zoom: 12 },
    singapore: { lat: 1.3521,   lng: 103.8198,  zoom: 12 },
    bangkok:   { lat: 13.7563,  lng: 100.5018,  zoom: 12 },
    manila:    { lat: 14.5995,  lng: 120.9842,  zoom: 13 },
    la:        { lat: 34.0522,  lng: -118.2437, zoom: 10 },
    hawaii:    { lat: 21.3069,  lng: -157.8583, zoom: 11 },
    seoul:     { lat: 37.5665,  lng: 126.9780,  zoom: 12 },
  };

  // ── カテゴリ別マーカー色 ─────────────────────────────────
  var CATEGORY_COLOR = {
    vital: '#e74c3c',
    food:  '#27ae60',
    local: '#f39c12',
    play:  '#2a9d8f',
  };

  // ── SVGマーカーアイコンを生成 ─────────────────────────────
  function markerIcon(color) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">'
      + '<path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 22 14 22S28 24.5 28 14C28 6.27 21.73 0 14 0z"'
      + ' fill="' + color + '" stroke="#fff" stroke-width="2.5"/>'
      + '<circle cx="14" cy="14" r="5.5" fill="#fff" opacity="0.95"/>'
      + '</svg>';
    return {
      url: 'data:image/svg+xml,' + encodeURIComponent(svg),
      scaledSize: new google.maps.Size(28, 36),
      anchor: new google.maps.Point(14, 36),
    };
  }

  // ── Maps JS API を非同期ロード ────────────────────────────
  var _mapsLoaded = false;
  var _mapsCallbacks = [];

  function onMapsReady() {
    _mapsLoaded = true;
    _mapsCallbacks.forEach(function(cb) { cb(); });
    _mapsCallbacks = [];
  }

  function loadMapsAPI(key, callback) {
    if (_mapsLoaded && typeof google !== 'undefined') {
      callback();
      return;
    }
    _mapsCallbacks.push(callback);
    if (document.querySelector('script[data-maps-loader]')) return;

    window._wamilyMapsReady = onMapsReady;
    var script = document.createElement('script');
    script.setAttribute('data-maps-loader', '1');
    script.src = 'https://maps.googleapis.com/maps/api/js?key=' + key
               + '&callback=_wamilyMapsReady&loading=async';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }

  // ── InfoWindow の中身を生成 ───────────────────────────────
  function buildInfoWindowContent(spot) {
    var desc = spot.description.length > 90
      ? spot.description.slice(0, 90) + '…'
      : spot.description;

    // Google Maps リンク（placeId があれば使用、なければ名前で検索）
    var mapsUrl = spot.placeId
      ? 'https://maps.google.com/?q=place_id:' + spot.placeId
      : 'https://maps.google.com/maps/search/' + encodeURIComponent(spot.name);

    return '<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:230px;padding:2px 0">'
      + '<p style="font-size:14px;font-weight:600;margin:0 0 5px;color:#221c14">'
        + spot.emoji + '&nbsp;' + spot.name
      + '</p>'
      + '<p style="font-size:11px;color:#6b5e4e;margin:0 0 10px;line-height:1.6">' + desc + '</p>'
      + '<a href="' + mapsUrl + '" target="_blank" rel="noopener noreferrer"'
        + ' style="display:inline-flex;align-items:center;gap:5px;background:#2a9d8f;color:#fff;'
        + 'font-size:12px;font-weight:500;padding:7px 14px;border-radius:6px;text-decoration:none">'
        + '\uD83D\uDCCD Googleマップで開く'
      + '</a>'
    + '</div>';
  }

  // ── メイン：スポット地図を初期化 ──────────────────────────
  function initSpotsMap(spots, slug) {
    var mapEl = document.getElementById('spots-map');
    var section = document.getElementById('spots-map-section');
    if (!mapEl) return;

    var key = window.WAMILY_MAPS_KEY;
    if (!key || key === 'YOUR_MAPS_API_KEY_HERE') {
      if (section) section.style.display = 'none';
      return;
    }

    // lat/lng を持つスポットだけ対象
    var spotsWithCoords = spots.filter(function(s) {
      return s.lat && s.lng;
    });

    if (spotsWithCoords.length === 0) {
      if (section) section.style.display = 'none';
      return;
    }

    loadMapsAPI(key, function() {
      var config = COUNTRY_CONFIG[slug] || COUNTRY_CONFIG.london;

      var map = new google.maps.Map(mapEl, {
        center:              { lat: config.lat, lng: config.lng },
        zoom:                config.zoom,
        mapTypeControl:      false,
        streetViewControl:   false,
        fullscreenControl:   false,
        zoomControl:         true,
        gestureHandling:     'cooperative',
      });

      var infoWindow = new google.maps.InfoWindow();
      var bounds = new google.maps.LatLngBounds();
      var markers = []; // {marker, category} のリスト

      spotsWithCoords.forEach(function(spot) {
        var position = { lat: spot.lat, lng: spot.lng };

        var marker = new google.maps.Marker({
          map:      map,
          position: position,
          title:    spot.name,
          icon:     markerIcon(CATEGORY_COLOR[spot.category] || '#2a9d8f'),
        });

        markers.push({ marker: marker, category: spot.category });
        bounds.extend(position);

        marker.addListener('click', function() {
          infoWindow.setContent(buildInfoWindowContent(spot));
          infoWindow.open(map, marker);
        });
      });

      // 全マーカーが見えるようにズーム調整
      if (spotsWithCoords.length > 1) {
        map.fitBounds(bounds, { top: 30, right: 30, bottom: 30, left: 30 });
      }

      // 地図外クリックでInfoWindow閉じる
      map.addListener('click', function() { infoWindow.close(); });

      // ── フィルターボタンと連動 ─────────────────────────────
      var filterBtns = document.querySelectorAll('.filter-btn');
      filterBtns.forEach(function(btn) {
        btn.addEventListener('click', function() {
          var category = btn.dataset.category;
          infoWindow.close();

          markers.forEach(function(item) {
            if (category === 'all' || item.category === category) {
              item.marker.setVisible(true);
            } else {
              item.marker.setVisible(false);
            }
          });
        });
      });
    });
  }

  // グローバルに公開
  window.initSpotsMap = initSpotsMap;

})();
