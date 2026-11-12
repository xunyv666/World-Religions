/* =========================================================
   宗教传入各国年份 · 数据层
   供「传播时间轴」使用：拖动时间轴时，地图按这张表
   逐步点亮该宗教已经进入的国家。

   口径：该宗教在当地形成稳定、可见的信仰社群或国家
   制度的年份；不是第一个传教士到访的年份。拿不准的
   统一取「当地出现成规模社群」的下限。
   未列出的国家表示该宗教在当地没有形成稳定社群。
   ========================================================= */
(function () {
  "use strict";

  var A = {};

  /* ---------------- 基督教 ---------------- */
  A.chr = {
    /* 欧洲 */
    "Italy": 50, "Spain": 50, "Greece": 50, "Portugal": 60, "France": 250,
    "Belgium": 300, "Germany": 300, "Austria": 300, "Switzerland": 300,
    "Luxembourg": 300, "Albania": 300, "Romania": 300, "Moldova": 300,
    "Cyprus": 100, "Macedonia": 600, "Malta": 1091, "Netherlands": 650,
    "Ireland": 430, "United Kingdom": 600, "Denmark": 1000, "Sweden": 1000,
    "Norway": 1000, "Finland": 1150, "Iceland": 1000, "Poland": 966,
    "Czech Republic": 900, "Slovakia": 900, "Hungary": 1000, "Croatia": 900,
    "Slovenia": 900, "Bosnia and Herzegovina": 900, "Republic of Serbia": 900,
    "Montenegro": 900, "Bulgaria": 864, "Belarus": 988, "Ukraine": 988,
    "Russia": 988, "Estonia": 1030, "Latvia": 1200, "Lithuania": 1250,
    /* 中东与高加索 */
    "Israel": 30, "West Bank": 30, "Jordan": 450, "Lebanon": 300,
    "Syria": 300, "Iraq": 300, "Iran": 300, "Turkey": 325, "Armenia": 301,
    "Georgia": 330, "Azerbaijan": 600, "Kazakhstan": 800, "Uzbekistan": 800,
    "Turkmenistan": 800, "Kyrgyzstan": 800, "Tajikistan": 800,
    "Afghanistan": 1600, "Yemen": 400, "Oman": 700, "Saudi Arabia": 1700,
    "United Arab Emirates": 1600, "Qatar": 1700, "Kuwait": 1700,
    /* 东亚、南亚与东南亚 */
    "China": 700, "Japan": 1549, "South Korea": 1600, "North Korea": 1600,
    "Mongolia": 700, "India": 1500, "Pakistan": 1500, "Bangladesh": 1600,
    "Nepal": 1600, "Sri Lanka": 600, "Vietnam": 1500, "Thailand": 1600,
    "Myanmar": 1600, "Cambodia": 1600, "Laos": 1600, "Philippines": 1521,
    "Indonesia": 1521, "Malaysia": 1500, "Brunei": 1600, "East Timor": 1540,
    /* 非洲 */
    "Egypt": 60, "Ethiopia": 300, "Eritrea": 300, "Djibouti": 700,
    "Sudan": 600, "Somalia": 1000, "South Sudan": 1900, "Libya": 700,
    "Tunisia": 200, "Algeria": 200, "Morocco": 200, "Western Sahara": 1500,
    "Mauritania": 1500, "Mali": 1500, "Niger": 1500, "Burkina Faso": 1500,
    "Senegal": 1500, "Gambia": 1500, "Guinea Bissau": 1500, "Guinea": 1500,
    "Sierra Leone": 1500, "Liberia": 1800, "Ivory Coast": 1500, "Ghana": 1500,
    "Togo": 1500, "Benin": 1500, "Nigeria": 1500, "Cameroon": 1500,
    "Chad": 1500, "Central African Republic": 1500, "Gabon": 1843,
    "Republic of the Congo": 1500, "Democratic Republic of the Congo": 1500,
    "Rwanda": 1500, "Burundi": 1500, "Uganda": 1500, "Kenya": 1500,
    "United Republic of Tanzania": 1500, "Angola": 1500, "Zambia": 1900,
    "Zimbabwe": 1500, "Malawi": 1900, "Mozambique": 1500, "Botswana": 1800,
    "Namibia": 1800, "South Africa": 1652, "Lesotho": 1833, "Swaziland": 1900,
    "Madagascar": 1900, "Equatorial Guinea": 1900,
    /* 美洲 */
    "United States of America": 1607, "Canada": 1608, "Mexico": 1521,
    "Guatemala": 1524, "Honduras": 1524, "El Salvador": 1524,
    "Nicaragua": 1524, "Costa Rica": 1524, "Panama": 1513, "Colombia": 1532,
    "Venezuela": 1531, "Ecuador": 1532, "Peru": 1532, "Bolivia": 1532,
    "Chile": 1548, "Argentina": 1536, "Uruguay": 1580, "Paraguay": 1570,
    "Brazil": 1500, "Cuba": 1511, "Haiti": 1493, "Dominican Republic": 1496,
    "Jamaica": 1511, "Puerto Rico": 1508, "The Bahamas": 1600,
    "Trinidad and Tobago": 1596, "Belize": 1638, "Guyana": 1600,
    "Suriname": 1600, "Bermuda": 1600, "Falkland Islands": 1765,
    "Greenland": 1000,
    /* 大洋洲 */
    "Australia": 1788, "New Zealand": 1820, "New Caledonia": 1853,
    "Fiji": 1875, "Papua New Guinea": 1890, "Solomon Islands": 1890,
    "Vanuatu": 1900
  };

  /* ---------------- 伊斯兰教 ---------------- */
  A.isl = {
    /* 中东与西亚 */
    "Saudi Arabia": 610, "Yemen": 630, "Oman": 630, "United Arab Emirates": 630,
    "Qatar": 630, "Kuwait": 630, "Syria": 630, "Jordan": 630, "Lebanon": 630,
    "Israel": 634, "West Bank": 634, "Iraq": 650, "Iran": 650, "Turkey": 1071,
    "Cyprus": 1150, "Afghanistan": 715, "Azerbaijan": 1500, "Armenia": 1800,
    "Georgia": 1780,
    /* 中亚 */
    "Kazakhstan": 850, "Uzbekistan": 850, "Turkmenistan": 850,
    "Kyrgyzstan": 850, "Tajikistan": 850, "Russia": 1550,
    /* 南亚、东南亚与东亚 */
    "Pakistan": 711, "India": 711, "Bangladesh": 1204, "Sri Lanka": 1500,
    "Nepal": 1600, "China": 651, "Mongolia": 1200, "South Korea": 1400,
    "Japan": 1540, "Vietnam": 900, "Thailand": 1300, "Myanmar": 900,
    "Cambodia": 1400, "Laos": 1600, "Malaysia": 1500, "Indonesia": 1200,
    "Brunei": 1400, "Philippines": 1380, "East Timor": 1600,
    /* 欧洲 */
    "Spain": 800, "Portugal": 800, "Italy": 1000, "Malta": 1000, "Cyprus": 1150, "Albania": 1400, "Greece": 1400, "Bulgaria": 1400,
    "Croatia": 1400, "Slovenia": 1400, "Bosnia and Herzegovina": 1400,
    "Republic of Serbia": 1400, "Montenegro": 1400, "Macedonia": 1400, "Romania": 1500,
    "Hungary": 1500, "Austria": 1500, "Germany": 1500, "France": 800,
    "Switzerland": 1500, "Czech Republic": 1500, "Slovakia": 1500,
    "Ukraine": 1600, "Belarus": 1600, "Poland": 1600, "Netherlands": 1600,
    "Belgium": 1600, "United Kingdom": 1600, "Ireland": 1600, "Denmark": 1600,
    "Sweden": 1600, "Norway": 1600, "Finland": 1600, "Estonia": 1600,
    "Latvia": 1600, "Lithuania": 1600, "Iceland": 1600, "Luxembourg": 1600,    /* 非洲 */
    "Egypt": 642, "Libya": 700, "Tunisia": 700, "Algeria": 700, "Morocco": 700,
    "Western Sahara": 700, "Mauritania": 700, "Mali": 1000, "Niger": 1100,
    "Nigeria": 1100, "Chad": 1100, "Sudan": 700, "Eritrea": 700,
    "Djibouti": 700, "Somalia": 700, "Ethiopia": 700, "Senegal": 1000,
    "Gambia": 1000, "Guinea Bissau": 1000, "Guinea": 1000, "Sierra Leone": 1000,
    "Ivory Coast": 1000, "Ghana": 1000, "Togo": 1000, "Benin": 1000,
    "Burkina Faso": 1000, "Liberia": 1800, "Cameroon": 1100,
    "Central African Republic": 1200, "Gabon": 1800, "Republic of the Congo": 1500,
    "Democratic Republic of the Congo": 1500, "Rwanda": 1500, "Burundi": 1500,
    "Uganda": 1800, "Kenya": 1500, "United Republic of Tanzania": 1500,
    "South Sudan": 1500, "Angola": 1500, "Zambia": 1600, "Zimbabwe": 1600,
    "Malawi": 1700, "Mozambique": 1600, "Botswana": 1900, "Namibia": 1800,
    "South Africa": 1650, "Lesotho": 1900, "Swaziland": 1900,
    "Madagascar": 1500, "Equatorial Guinea": 1500,
    /* 美洲：伊斯兰直到近代随非洲奴隶、叙利亚移民与印度侨民才成规模 */
    "United States of America": 1870, "Canada": 1900, "Brazil": 1850,
    "Mexico": 1900, "Guatemala": 1950, "Belize": 1950, "Honduras": 1950,
    "El Salvador": 1950, "Nicaragua": 1950, "Costa Rica": 1950, "Panama": 1950,
    "Colombia": 1950, "Venezuela": 1950, "Ecuador": 1950, "Peru": 1950,
    "Bolivia": 1950, "Chile": 1900, "Argentina": 1900, "Uruguay": 1950,
    "Paraguay": 1950, "Cuba": 1950, "Haiti": 1950, "Dominican Republic": 1950,
    "Jamaica": 1900, "Puerto Rico": 1950, "The Bahamas": 1950,
    "Trinidad and Tobago": 1900, "Guyana": 1900, "Suriname": 1930,
    "Bermuda": 1950, "Falkland Islands": 1950, "Greenland": 1950,
    /* 大洋洲 */
    "Australia": 1800, "New Zealand": 1950, "Fiji": 1870,
    "Papua New Guinea": 1900, "Solomon Islands": 1900, "Vanuatu": 1900,
    "New Caledonia": 1900
  };

  /* ---------------- 佛教 ---------------- */
  A.bud = {
    "India": -528, "Nepal": -528, "Pakistan": -200, "Afghanistan": -200,
    "Sri Lanka": -243, "Bangladesh": 300, "China": 65, "Japan": 538,
    "South Korea": 384, "North Korea": 384, "Mongolia": 1250, "Vietnam": 200,
    "Thailand": 500, "Myanmar": 500, "Cambodia": 550, "Laos": 500,
    "Bhutan": 500, "India": -528, "Iran": 200, "Iraq": 100, "Turkey": 50,
    "Syria": 100, "Lebanon": 100, "Jordan": 50, "Israel": 100,
    "West Bank": 100, "Egypt": 50, "Cyprus": 100, "Greece": 100,
    "Kazakhstan": 200, "Uzbekistan": 300, "Turkmenistan": 200,
    "Kyrgyzstan": 200, "Tajikistan": 200, "Azerbaijan": 100, "Georgia": 100,
    "Armenia": 100, "Russia": 200, "Malaysia": 500, "Brunei": 500,
    "Indonesia": 1280, "East Timor": 1900,
    "Philippines": 1900, "United Kingdom": 1900, "France": 1900, "Germany": 1900, "Italy": 1900,
    "Spain": 1900, "Sweden": 1900, "Norway": 1900,
    "Denmark": 1900, "Finland": 1900, "Netherlands": 1900, "Belgium": 1900,
    "Poland": 1900, "Austria": 1900, "Switzerland": 1900,
    "United States of America": 1900, "Canada": 1900, "Mexico": 1900,
    "Brazil": 1900, "Peru": 1900, "Argentina": 1900, "Chile": 1900,
    "Colombia": 1900, "Australia": 1900, "New Zealand": 1900, "Fiji": 1900,
    "Papua New Guinea": 1900, "Solomon Islands": 1900, "Vanuatu": 1900,
    "South Africa": 1900, "Nigeria": 1900, "Kenya": 1900, "New Caledonia": 1900, "Bermuda": 1900, "Puerto Rico": 1900,
    "Cuba": 1900, "Haiti": 1900, "Dominican Republic": 1900, "Jamaica": 1900,
    "Trinidad and Tobago": 1900, "Guyana": 1900, "Suriname": 1900,
    "Belize": 1900, "Panama": 1900, "Guatemala": 1900, "Honduras": 1900,
    "El Salvador": 1900, "Nicaragua": 1900, "Costa Rica": 1900,
    "Uruguay": 1900, "Paraguay": 1900,
    "Bolivia": 1900, "Ecuador": 1900, "Venezuela": 1900, "The Bahamas": 1900,
    "Falkland Islands": 1900, "Greenland": 1900
  };

  /* ---------------- 道教 ---------------- */
  A.tao = {
    "China": 142, "South Korea": 1170, "Japan": 1200, "Vietnam": 1800,
    "Mongolia": 1300, "Myanmar": 1300, "Thailand": 1800, "Cambodia": 1800,
    "Laos": 1800, "Malaysia": 1800, "Indonesia": 1800,
    "Brunei": 1800, "Philippines": 1800, "Kazakhstan": 1300,
    "Uzbekistan": 1300, "Turkmenistan": 1300, "Kyrgyzstan": 1300,
    "Tajikistan": 1300, "Russia": 1900, "Ukraine": 1900, "Belarus": 1900,
    "Poland": 1900, "Germany": 1900, "France": 1950, "United Kingdom": 1950,
    "Netherlands": 1950, "Belgium": 1950, "Spain": 1950, "Portugal": 1950,
    "Italy": 1950, "Greece": 1950, "Austria": 1950, "Switzerland": 1950,
    "Sweden": 1950, "Norway": 1950, "Denmark": 1950, "Finland": 1950,
    "United States of America": 1900, "Canada": 1900, "Australia": 1900,
    "New Zealand": 1900, "Brazil": 1900, "Peru": 1900, "Argentina": 1900,
    "Mexico": 1900, "South Africa": 1950, "Nigeria": 1950, "Egypt": 1950
  };

  /* 传入年份表只认地图上的国家名：表里出现地图上不存在的条目，
     「已传入 N 个国家」的计数就会虚高。 */
  window.ARRIVAL = A;
})();
