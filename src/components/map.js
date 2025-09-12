import L from "leaflet";


// --- 안전 바인딩 헬퍼 ---
function bindChange(id, handler) {
  const el = document.getElementById(id);
  if (!el) {
    console.warn(`#${id} 엘리먼트를 찾을 수 없습니다.`);
    return null;
  }
  el.addEventListener("change", handler);
  return el;
}

// 지도 초기화
export function initMap() {
  const VWORLD_KEY = import.meta.env.VITE_VWORLD_KEY;
  const domain = location.hostname || "localhost";

  const map = L.map("map").setView([37.5665, 126.978], 11);

  const vworldUrl = `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Base/{z}/{y}/{x}.png?domain=${domain}`;
  L.tileLayer(vworldUrl, {
    attribution: 'Map © <a href="https://map.vworld.kr">VWorld</a>',
  }).addTo(map);

  const zoneLayers = { restricted: null, prohibited: null };

  // 세 토글 모두 안전 바인딩으로 변경
  bindChange("toggle-restricted", async (e) => {
    if (e.target.checked) {
      zoneLayers.restricted = await loadZone(
        map,
        "LT_C_AISRESC",
        "#f90",
        "비행제한구역"
      );
    } else if (zoneLayers.restricted) {
      map.removeLayer(zoneLayers.restricted);
      zoneLayers.restricted = null;
    }
  });

  bindChange("toggle-prohibited", async (e) => {
    if (e.target.checked) {
      zoneLayers.prohibited = await loadZone(
        map,
        "LT_C_AISPRHC",
        "#d00",
        "비행금지구역"
      );
    } else if (zoneLayers.prohibited) {
      map.removeLayer(zoneLayers.prohibited);
      zoneLayers.prohibited = null;
    }
  });

  return map;
}

// 공통 데이터 로딩 함수
async function loadZone(map, layerCode, color, label) {
  const key = import.meta.env.VITE_VWORLD_KEY;
  const domain = location.hostname || "localhost";
  const b = map.getBounds();

  const url =
    `/vworld/req/data?service=data&request=GetFeature&data=${layerCode}` +
    `&format=json&crs=EPSG:4326&size=1000` +
    `&geomFilter=BOX(${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()})` +
    `&key=${key}&domain=${domain}`;

  try {
    console.log(`${label} 요청:`, url);
    const res = await fetch(url);
    const json = await res.json();

    console.log(
      `${label} status:`,
      json?.response?.status,
      "total:",
      json?.response?.record?.total
    );

    const features = json?.response?.result?.featureCollection;
    if (!features) {
      console.warn(`${label} 데이터 없음`, json);
      return null;
    }

    const layer = L.geoJSON(features, {
      style: { color, weight: 1, fillOpacity: 0.3 },
      onEachFeature: (f, lyr) => {
        const p = f.properties || {};
        const tag = p.prh_lbl_1 || p.res_lbl_1 || "";
        lyr.bindPopup(`${label}<br/>라벨: ${tag}`);
      },
    }).addTo(map);

    return layer;
  } catch (err) {
    console.error(`${label} API 오류:`, err);
    return null;
  }
}
