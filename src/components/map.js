import L from "leaflet";
import Papa from "papaparse"; // npm install papaparse

function bindChange(id, handler) {
  const el = document.getElementById(id);
  if (!el) {
    console.warn(`#${id} 엘리먼트를 찾을 수 없습니다.`);
    return null;
  }
  el.addEventListener("change", handler);
  return el;
}

async function loadUASFromCSV(map, path) {
  const res = await fetch(path);
  const text = await res.text();

  // CSV 파싱 (헤더 존재)
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  const group = L.layerGroup();

  parsed.data.forEach((row) => {
    const code = row["코드"];
    const name = row["위치"];
    const areaStr = row["수평범위"];
    const altitude = row["수직범위"];
    const note = row["특기사항"] || "";

    if (!areaStr) return;

    // --- 1) 원(반경) ---
    if (areaStr.includes("반경")) {
      // "354421N1270027E 반경 1.8 KM (1.0 NM)"
      const parts = areaStr.split(" ");
      const dmsStr = parts[0]; // 좌표 문자열
      const center = parseDMS(dmsStr);

      const radiusMatch = areaStr.match(/반경\s*([\d.]+)\s*KM/i);
      const radiusKm = radiusMatch ? parseFloat(radiusMatch[1]) : 1;

      if (center) {
        const circle = L.circle(center, {
          radius: radiusKm * 1000,
          color: "#0a0",
          weight: 1,
          fillOpacity: 0.3,
        }).bindPopup(
          `<b>${code}</b> - ${name}<br/>고도: ${altitude}<br/>${note}`
        );
        group.addLayer(circle);
      }
    }

    // --- 2) 다각형 ---
    else if (areaStr.includes("-")) {
      // "좌표 - 좌표 - 좌표"
      const coords = areaStr
        .split("-")
        .map((s) => parseDMS(s.trim()))
        .filter(Boolean);

      if (coords.length > 2) {
        const polygon = L.polygon(coords, {
          color: "#06c",
          weight: 1,
          fillOpacity: 0.3,
        }).bindPopup(
          `<b>${code}</b> - ${name}<br/>고도: ${altitude}<br/>${note}`
        );
        group.addLayer(polygon);
      }
    }
  });

  group.addTo(map);
  return group;
}

// "354421N1270027E" → [lat, lng]
function parseDMS(dmsStr) {
  const match = dmsStr.match(
    /(\d{2,3})(\d{2})(\d{2})([NS])?(\d{3})(\d{2})(\d{2})([EW])?/
  );
  if (!match) return null;

  const lat =
    dmsToDecimal(match[1], match[2], match[3]) * (match[4] === "S" ? -1 : 1);
  const lng =
    dmsToDecimal(match[5], match[6], match[7]) * (match[8] === "W" ? -1 : 1);

  return [lat, lng];
}

function dmsToDecimal(d, m, s) {
  return parseInt(d) + parseInt(m) / 60 + parseInt(s) / 3600;
}

export function initMap() {
  const VWORLD_KEY = import.meta.env.VITE_VWORLD_KEY;
  const domain = location.hostname || "localhost";

  const map = L.map("map").setView([37.5665, 126.978], 11);

  const vworldUrl = `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Base/{z}/{y}/{x}.png?domain=${domain}`;
  L.tileLayer(vworldUrl, {
    attribution: 'Map © <a href="https://map.vworld.kr">VWorld</a>',
  }).addTo(map);

  const zoneLayers = {
    restricted: null,
    prohibited: null,
    atz: null,
    uas: null,
  };

  // 비행제한구역
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

  // 비행금지구역
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

  // ATZ
  bindChange("toggle-atz", async (e) => {
    if (e.target.checked) {
      zoneLayers.atz = await loadZone(
        map,
        "LT_C_AISATZC",
        "#06c",
        "ATZ (비행장교통구역)"
      );
    } else if (zoneLayers.atz) {
      map.removeLayer(zoneLayers.atz);
      zoneLayers.atz = null;
    }
  });

  // 초경량비행장치공역 (CSV 기반)
  bindChange("toggle-uas", async (e) => {
    if (e.target.checked) {
      zoneLayers.uas = await loadUASFromCSV(map, "/data/drone_flight_utf8.csv");
    } else if (zoneLayers.uas) {
      map.removeLayer(zoneLayers.uas);
      zoneLayers.uas = null;
    }
  });

  return map;
}

// VWorld API용
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
    const res = await fetch(url);
    const json = await res.json();
    const features = json?.response?.result?.featureCollection;
    if (!features) return null;

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