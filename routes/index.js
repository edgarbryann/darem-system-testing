// routes/index.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const csv = require('csvtojson');
// const formidable = require('formidable'); // not used, remove if unneeded
const upload = multer({ dest: 'uploads/' });

const db = require('../dabatase');       // <-- fixed typo: uses mysql2/promise pool
const fetch = require('./controller.js'); // your service module (already updated)
const { OpenWeatherAPI } = require('openweather-api-node');

/* ===== Views ===== */
router.get('/', (req, res) => {
  res.render('landing', { title: 'Express', session: req.session });
});

router.get('/landing', (req, res) => {
  res.render('landing', { title: 'Express' });
});

router.get('/profile', (req, res) => {
  res.render('profile', { title: 'Express' });
});

/* ===== Auth (demo/plaintext) ===== */
router.post('/login', async (req, res) => {
  const { user_email_address, user_password } = req.body;

  if (!user_email_address || !user_password) {
    return res.status(400).send('Please Enter Email Address and Password Details');
  }

  try {
    const [users] = await db.query(
      'SELECT * FROM user_login WHERE user_email = ?',
      [user_email_address]
    );

    if (users.length === 0) return res.status(401).send('Incorrect Email Address');

    const user = users[0];
    if (user.user_password !== user_password) { // NOTE: consider bcrypt in production
      return res.status(401).send('Incorrect Password');
    }

    req.session.user_id = user.user_id;
    return res.redirect('/darem');
  } catch (e) {
    console.error(e);
    return res.status(500).send('Server error');
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/landing'));
});

/* ===== Tables (example page) ===== */
router.get('/tables', async (req, res) => {
  try {
    // Sync f_id by matching names (parameterized update per row)
    const [names] = await db.query(
      'SELECT f_id, CONCAT(f_name, m_name, l_name) AS fullname FROM farmer_demo'
    );

    for (const row of names) {
      await db.query(
        'UPDATE qp_farmer_raw SET f_id = ? WHERE CONCAT(raw_fname, raw_mname, raw_lname) = ?',
        [row.f_id, row.fullname]
      );
    }

    const [rows] = await db.query(`
      SELECT f.f_id,
             m.muni_name AS municipality,
             b.brgy_name AS barangay,
             CONCAT(f.f_name, ' ', f.m_name, ' ', f.l_name) AS fullname,
             f.f_gender AS gender
      FROM farmer_demo AS f
      JOIN tbl_muni AS m ON f.f_municipality = m.muni_id
      JOIN tbl_barangay AS b ON f.f_barangay = b.brgy_id
    `);

    res.render('tables', { data: rows });
  } catch (err) {
    console.error(err);
    res.render('tables', { data: [] });
  }
});

/* ===== Municipality dashboard ===== */
router.get('/darem/:mun', async (req, res) => {
  try {
    const muniName = req.params.mun;

    const [[farmerCountRow]] = await db.query(
      `SELECT COUNT(*) AS Farmer_ID
       FROM farmer_demo f
       JOIN tbl_muni m ON f.f_municipality = m.muni_id
       WHERE m.muni_name = ?`,
      [muniName]
    );
    const [[areaCountRow]] = await db.query(
      `SELECT TRUNCATE(SUM(q.raw_area), 2) AS Area_count
       FROM qp_farmer_raw q
       JOIN tbl_muni m ON q.raw_municipality = m.muni_id
       WHERE m.muni_name = ?`,
      [muniName]
    );

    res.render('mun_dashboard', {
      title: muniName,
      farmer_count: farmerCountRow?.Farmer_ID ?? 0,
      area_count: areaCountRow?.Area_count ?? 0,
    });
  } catch (e) {
    console.error(e);
    res.status(500).send('Server error');
  }
});

/* ===== Weather demo ===== */
router.get('/weather-dispplay', async (req, res) => {
  try {
    const weather = new OpenWeatherAPI({
      key: 'put-key-here',
      locationName: 'New York',
      units: 'imperial',
    });
    const data = await weather.getCurrent();
    console.log(`Current temperature in New York is: ${data.weather.temp.cur}°F`);
    res.send({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).send('Weather error');
  }
});

/* ===== Main dashboard ===== */
router.get('/darem', async (req, res) => {
  try {
    const [[total_farmer_count]] = await db.query(
      `SELECT COUNT(DISTINCT CONCAT(raw_fname,raw_mname,raw_lname)) AS count_farmer
       FROM qp_farmer_raw`
    );
    const [farmer_count] = await db.query(
      `SELECT COUNT(DISTINCT CONCAT(raw_fname,raw_mname,raw_lname)) AS count_farmer,
              YEAR(raw_dgathered) AS year_
       FROM qp_farmer_raw
       GROUP BY YEAR(raw_dgathered)
       ORDER BY YEAR(raw_dgathered)`
    );

    const [[total_area_count]] = await db.query(
      'SELECT TRUNCATE(SUM(raw_area),2) AS Area_count FROM qp_farmer_raw'
    );
    const [area_count] = await db.query(
      `SELECT TRUNCATE(SUM(raw_area),2) AS Area_count,
              YEAR(raw_dgathered) AS year_
       FROM qp_farmer_raw
       GROUP BY YEAR(raw_dgathered)
       ORDER BY YEAR(raw_dgathered)`
    );

    const [[total_harvest_count]] = await db.query(
      'SELECT TRUNCATE(SUM(Production),2) AS production_count FROM harvest_data'
    );
    const [harvest_count] = await db.query(
      `SELECT TRUNCATE(SUM(Production),2) AS production_count,
              YEAR(year_gathered) AS year_
       FROM harvest_data
       GROUP BY YEAR(year_gathered)
       ORDER BY YEAR(year_gathered)`
    );

    const [[total_expected_harvest]] = await db.query(
      `SELECT ROUND(SUM(raw_population),2) AS expected_harvest
       FROM qp_farmer_raw
       WHERE YEAR(raw_dharvest) = YEAR(CURDATE())`
    );
    const [qp_price] = await db.query(
      `SELECT AVG(lg_price) AS price, YEAR(date) AS year_
       FROM qp_price
       GROUP BY YEAR(date)
       ORDER BY YEAR(date) DESC`
    );
    const [topproducer] = await db.query(
      `SELECT SUM(raw_population) AS population, m.muni_name
       FROM qp_farmer_raw q
       JOIN tbl_muni m ON q.raw_municipality = m.muni_id
       GROUP BY q.raw_municipality, m.muni_name
       ORDER BY population DESC`
    );

    // municipalities (ordered by id length then name) + prepend "Camarines Norte"
    const [cam_norte_municipality] = await db.query(`
      SELECT t.muni_select
      FROM (
        SELECT DISTINCT m.muni_name AS muni_select, q.raw_municipality
        FROM qp_farmer_raw q
        JOIN tbl_muni m ON q.raw_municipality = m.muni_id
        WHERE q.raw_municipality IS NOT NULL AND q.raw_municipality <> ''
      ) t
      ORDER BY LENGTH(t.raw_municipality) ASC, t.muni_select ASC
    `);

    const pineapple_population = await fetch.fetch_population();
    const general_pop1 = await fetch.fetch_general_pop();
    const farmersqp = await fetch.fetch_farmers();
    const donut_data = await fetch.fetch_gender_data_total();
    const expected_harvest_table = await fetch.fetch_expected_harvest();
    const farmer_count_peryear1 = await fetch.fetch_farmer_peryear();
    const qp_area = await fetch.fetch_area();
    const rbsba_table = await fetch.fetch_rbsba_table();
    const gender_data = await fetch.fetch_gender_data();
    const pest_data = await fetch.fetch_pest_data();
    const diseases_data = await fetch.fetch_diseases_data();
    const weeds_data = await fetch.fetch_weeds_data();

    const [table_data_harvest] = await db.query(`
      SELECT f.f_id,
             m.muni_name AS municipality,
             b.brgy_name AS barangay,
             CONCAT(f.f_name,' ',f.m_name,' ',f.l_name) AS fullname,
             f.f_gender AS gender
      FROM farmer_demo f
      JOIN tbl_muni m ON f.f_municipality = m.muni_id
      JOIN tbl_barangay b ON f.f_barangay = b.brgy_id
    `);

    // Sync barangay ids (once per request; consider moving to a job)
    await db.query(`
      UPDATE qp_farmer_raw q
      JOIN tbl_barangay b
        ON q.raw_barangay = b.brgy_name
       AND q.raw_municipality = b.muni_id
      SET q.raw_barangay = b.brgy_id
    `);

    // build the series with "all" rows at index 0
    const farmer_count_series = [
      { count_farmer: total_farmer_count?.count_farmer ?? 0, year_: 'all' },
      ...farmer_count,
    ];
    const area_count_series = [
      { Area_count: total_area_count?.Area_count ?? 0, year_: 'all' },
      ...area_count,
    ];
    const harvest_count_series = [
      { production_count: total_harvest_count?.production_count ?? 0, year_: 'all' },
      ...harvest_count,
    ];
    const cam_norte_muni_series = [{ muni_select: 'Camarines Norte' }, ...cam_norte_municipality];

    const [population_percent] = await db.query(`
      SELECT
  TRUNCATE((t1.population - t2.population) / NULLIF(t2.population, 0) * 100, 2) AS change_pop,
  m.muni_name,
  t1.population AS pop1,
  t2.population AS pop2,
  (t1.population - t2.population) AS diff_pop,
  t1.year_gathered AS pop_year1,
  t2.year_gathered AS pop_year2
FROM tbl_muni m
JOIN (
  SELECT
    SUM(raw_population) AS population,
    raw_municipality,
    YEAR(CURDATE()) - 1 AS year_gathered
  FROM qp_farmer_raw
  WHERE YEAR(raw_dgathered) = YEAR(CURDATE()) - 1
  GROUP BY raw_municipality
) AS t1 ON m.muni_id = t1.raw_municipality
JOIN (
  SELECT
    SUM(raw_population) AS population,
    raw_municipality,
    YEAR(CURDATE()) - 2 AS year_gathered
  FROM qp_farmer_raw
  WHERE YEAR(raw_dgathered) = YEAR(CURDATE()) - 2
  GROUP BY raw_municipality
) AS t2 ON m.muni_id = t2.raw_municipality
ORDER BY change_pop DESC;

    `);

    const now = new Date();
    const data = {
      farmer_count_peryear1,
      general_pop1,
      pest_data,
      weeds_data,
      diseases_data,
      farmersqp,
      qp_area,
      rbsba_table,
      expected_harvest_table,
      pineapple_population,
      table_data_harvest,
      topproducer,
      donut_data,
      cam_norte_municipality: cam_norte_muni_series,
      farmer_count: farmer_count_series,
      area_count: area_count_series,
      gender_data,
      total_expected_harvest,
      harvest_count: harvest_count_series,
      qp_price,
      date: now.getFullYear(),
      date1: now.getFullYear() + 1,
      date2: now.getFullYear() - 2,
      date3: now.getFullYear() - 3,
      population_percent,
    };

    res.render('darem', data);
  } catch (e) {
    console.error(e);
    res.status(500).send('Server error');
  }
});

/* ===== API: counts & graphs ===== */
router.get('/qp_farmer_count', async (req, res) => {
  try {
    const [qp_farmer_count] = await db.query(`
      SELECT COUNT(*) AS farmer_count, m.muni_name AS muni_name
      FROM farmer_demo f
      JOIN tbl_muni m ON f.f_municipality = m.muni_id
      GROUP BY f.f_municipality, m.muni_name
    `);
    const [[total]] = await db.query(`SELECT COUNT(*) AS total_farmer FROM farmer_demo`);
    const rbsba_percent = await fetch.fetch_rbsba_percent();

    res.send({ qp_farmer_count, rbsba_percent, total });
  } catch (e) {
    console.error(e);
    res.status(500).send('Server error');
  }
});

router.get('/qp_farmer_age', async (req, res) => {
  try {
    const [qp_farmer_age] = await db.query(`
      SELECT counter_, range_ FROM twenty_five
      UNION ALL
      SELECT counter_, range_ FROM thirty_five
      UNION ALL
      SELECT counter_, range_ FROM forty_five
      UNION ALL
      SELECT counter_, range_ FROM fifty_five
      UNION ALL
      SELECT counter_, range_ FROM sixty_five
      UNION ALL
      SELECT counter_, range_ FROM seventy_five
      UNION ALL
      SELECT counter_, range_ FROM eighty_five
    `);
    const rbsba_status = await fetch.fetch_rbsba_status();

    res.send({ qp_farmer_age, rbsba_status });
  } catch (e) {
    console.error(e);
    res.status(500).send('Server error');
  }
});

/* ===== Uploads (CSV) ===== */
router.post('/upload', upload.single('sampleFile'), async (req, res) => {
  try {
    const source = await csv().fromFile(req.file.path);
    const year = source[0] ? Object.keys(source[0])[0] : null; // first column header (year)

    for (let j = 0; j < source.length; j++) {
      const keys = Object.keys(source[j]);
      for (let i = 2; i <= keys.length - 1; i++) {
        const rain_amount = source[j][keys[i]];
        const date = `${keys[0]}-${j + 1}-${keys[i]}`;
        const newdate = new Date(date).getMonth() + 1;
        const finaldate = `${keys[0]}-${newdate}-${j + 1}`;

        if (rain_amount !== '') {
          await db.query(
            'INSERT INTO weather_data VALUES (DEFAULT, ?, ?, "N/A")',
            [finaldate, rain_amount]
          );
        }
      }
    }
    res.send({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).send('Upload error');
  }
});

router.post('/upload_farmer_data', upload.single('sampleFile'), async (req, res) => {
  try {
    const source = await csv().fromFile(req.file.path);

    for (let i = 0; i < source.length; i++) {
      const row = source[i];
      const items = [
        row['Municipalities'],
        row['Barangay'],
        row['First Name'],
        row['Middle Initial'],
        row['Last Name'],
        row['Gender'],
        row['Birthdate'],
        row['Area (Ha)'],
        row['Population'],
        row['Date Data Gathered'],
        row['Stage of Crops'],
        row['Date of Harvest'],
        row['Status'],
        row['RBSBA'],
        row['Contact Number'],
        row['Tenurial'],
      ];

      await db.query(
        'INSERT INTO qp_farmer_raw VALUES (DEFAULT, "1", ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        items
      );
    }

    await db.query(`
      UPDATE qp_farmer_raw q
      JOIN tbl_muni m
        ON q.raw_municipality = m.muni_name
     SET q.raw_municipality = m.muni_id
     WHERE q.f_id = '1'
    `);

    res.send({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).send('Upload error');
  }
});

router.post('/upload_soil_test_kit', upload.single('sampleFile'), async (req, res) => {
  try {
    const source = await csv().fromFile(req.file.path);

    for (let i = 0; i < source.length; i++) {
      const items = [
        source[i]['First Name'],
        source[i]['Last Name'],
        source[i]['Municipality'],
        source[i]['Area(ha)'],
        source[i]['Date Sampled(D-M-Y)'],
        source[i]['pH'],
        source[i]['N'],
        source[i]['P'],
        source[i]['K'],
      ];
      await db.query(
        'INSERT INTO soil_test_kit VALUES (DEFAULT, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        items
      );
    }
    res.send({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).send('Upload error');
  }
});

router.post('/upload_qp_price', upload.single('sampleFile'), async (req, res) => {
  try {
    const source = await csv().fromFile(req.file.path);

    for (let i = 0; i < source.length; i++) {
      const items = [
        source[i]['DATE'],
        source[i]['Medium'],
        source[i]['Large'],
        source[i]['BUYER/SELLER'],
      ];
      await db.query('INSERT INTO qp_price VALUES (DEFAULT, ?, ?, ?, ?)', items);
    }
    res.send({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).send('Upload error');
  }
});

router.post('/upload_qp_harvest', upload.single('sampleFile'), async (req, res) => {
  try {
    const source = await csv().fromFile(req.file.path);

    for (let i = 0; i < source.length; i++) {
      const items = [
        source[i]['Municipality'],
        source[i]['Barangay'],
        source[i]['Production'],
        source[i]['Date'],
      ];
      await db.query('INSERT INTO harvest_data VALUES (DEFAULT, ?, ?, ?, ?)', items);
    }
    res.send({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).send('Upload error');
  }
});

router.post('/upload_pest_diseases_weed', upload.single('sampleFile'), async (req, res) => {
  try {
    const source = await csv().fromFile(req.file.path);

    for (let i = 0; i < source.length; i++) {
      const items = [
        source[i]['Category'],
        source[i]['Name'],
        source[i]['Description'],
        source[i]['Damage'],
        source[i]['Management'],
        source[i]['Report Count'],
      ];
      await db.query('INSERT INTO pests VALUES (DEFAULT, ?, ?, ?, ?, ?, ?)', items);
    }
    res.send({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).send('Upload error');
  }
});

/* ===== Data APIs ===== */
router.get('/common_pest', async (req, res) => {
  try {
    const [common_pests] = await db.query('SELECT name, `rank`, percent FROM pests');
    res.send({ common_pests });
  } catch (e) {
    console.error(e);
    res.status(500).send('Server error');
  }
});

router.get('/gender_graph', async (req, res) => {
  try {
    const gender_data = await fetch.fetch_gender_data();
    res.send({ gender_data });
  } catch (e) {
    console.error(e);
    res.status(500).send('Server error');
  }
});

router.get('/donut_graph', async (req, res) => {
  try {
    const donut_data = await fetch.fetch_gender_data_total();
    res.send({ donut_data });
  } catch (e) {
    console.error(e);
    res.status(500).send('Server error');
  }
});

router.get('/treemap', async (req, res) => {
  try {
    const [treemap] = await db.query(`
      SELECT TRUNCATE(SUM(q.raw_area),2) AS land_area,
             m.muni_name AS municipality
      FROM qp_farmer_raw q
      JOIN tbl_muni m ON q.raw_municipality = m.muni_id
      GROUP BY q.raw_municipality, m.muni_name
    `);
    res.send({ treemap });
  } catch (e) {
    console.error(e);
    res.status(500).send('Server error');
  }
});

router.get('/weather_data', async (req, res) => {
  try {
    const [weather] = await db.query(`
      SELECT YEAR(date) AS year_date,
             TRUNCATE(SUM(rain_amount), 2) AS rain_amount_total
      FROM weather_data
      GROUP BY YEAR(date)
      ORDER BY YEAR(date)
    `);
    res.send({ weather });
  } catch (e) {
    console.error(e);
    res.status(500).send('Server error');
  }
});

router.get('/pineapple_population', async (req, res) => {
  try {
    const data = {
      pineapple_population: await fetch.fetch_population(),
      harvest_permuni: await fetch.fetch_harvest_permuni(),
      general_pop: await fetch.fetch_general_pop(),
      rbsba_per_year: await fetch.fetch_rbsba_per_year(),
      gender_line: await fetch.fetch_gender_line(),
      area_line: await fetch.fetch_area_line(),
      area_all: await fetch.fetch_area_all(),
      female_age_stacked: await fetch.fetch_age_stacked_female(),
      male_age_stacked: await fetch.fetch_age_stacked_male(),
      rbsba_per_muni: await fetch.fetch_rbsba_per_muni(),
    };
    res.send(data);
  } catch (e) {
    console.error(e);
    res.status(500).send('Server error');
  }
});

router.get('/pie_land_area', async (req, res) => {
  try {
    const data = { land_area: await fetch.fetch_area() };
    res.send(data);
  } catch (e) {
    console.error(e);
    res.status(500).send('Server error');
  }
});

router.get('/pineapple_population_/:mun', async (req, res) => {
  try {
    const mun = req.params.mun;
    let rows;

    if (mun === 'Camarines Norte') {
      [rows] = await db.query(`
        SELECT SUM(q.raw_population) AS population,
               YEAR(q.raw_dgathered) AS year_gathered,
               m.muni_name
        FROM qp_farmer_raw q
        JOIN tbl_muni m ON q.raw_municipality = m.muni_id
        GROUP BY YEAR(q.raw_dgathered), q.raw_municipality, m.muni_name
        ORDER BY LENGTH(q.raw_municipality), q.raw_municipality, YEAR(q.raw_dgathered)
      `);
    } else {
      [rows] = await db.query(
        `
        SELECT SUM(q.raw_population) AS population,
               YEAR(q.raw_dgathered) AS year_gathered,
               b.brgy_name
        FROM qp_farmer_raw q
        JOIN tbl_barangay b ON q.raw_barangay = b.brgy_id
        JOIN tbl_muni m ON q.raw_municipality = m.muni_id
        WHERE m.muni_name = ?
        GROUP BY YEAR(q.raw_dgathered), q.raw_barangay, b.brgy_name
        ORDER BY LENGTH(q.raw_barangay), q.raw_barangay, YEAR(q.raw_dgathered)
        `,
        [mun]
      );
    }

    res.send({ pineapple_population: rows });
  } catch (e) {
    console.error(e);
    res.status(500).send('Server error');
  }
});

router.get('/qp_harvest', async (req, res) => {
  try {
    const [qp_harvest] = await db.query(`
      SELECT TRUNCATE(SUM(Production),2) AS production_report,
             YEAR(year_gathered) AS year_gathereds,
             QUARTER(year_gathered) AS quarters,
             CONCAT(YEAR(year_gathered), ' Quarter ', QUARTER(year_gathered)) AS year_gathered_1,
             Municipality
      FROM harvest_data
      WHERE YEAR(year_gathered) >= YEAR(CURDATE()) - 3
      GROUP BY YEAR(year_gathered), QUARTER(year_gathered), Municipality
      ORDER BY Municipality, YEAR(year_gathered), QUARTER(year_gathered)
    `);
    res.send({ qp_harvest });
  } catch (e) {
    console.error(e);
    res.status(500).send('Server error');
  }
});

router.get('/qp_price_line', async (req, res) => {
  try {
    const [price] = await db.query(`
      SELECT TRUNCATE(AVG(lg_price),2) AS price_large,
             TRUNCATE(AVG(med_price),2) AS price_med,
             YEAR(date) AS year_gathered
      FROM qp_price
      GROUP BY YEAR(date)
      ORDER BY YEAR(date)
    `);
    res.send({ price });
  } catch (e) {
    console.error(e);
    res.status(500).send('Server error');
  }
});

router.get('/farmer_permuni', async (req, res) => {
  try {
    const data = {
      farmer_count_permuni: await fetch.fetch_farmer_permuni(),
      farmer_count_peryear: await fetch.fetch_farmer_peryear(),
    };
    res.send(data);
  } catch (e) {
    console.error(e);
    res.status(500).send('Server error');
  }
});

router.get('/farmer_permuni_/:mun', async (req, res) => {
  try {
    const muniName = req.params.mun;
    const farmer_count_peryear_permuni = await fetch.fetch_farmer_peryear_permuni(muniName);
    res.send({ farmer_count_peryear_permuni });
  } catch (e) {
    console.error(e);
    res.status(500).send('Server error');
  }
});

router.get('/pie_graph', async (req, res) => {
  try {
    const [pie_data] = await db.query(`
      SELECT SUM(q.raw_population) AS expected_harvest,
             m.muni_name AS municipality
      FROM qp_farmer_raw q
      JOIN tbl_muni m ON q.raw_municipality = m.muni_id
      WHERE YEAR(q.raw_dharvest) = YEAR(CURDATE())
      GROUP BY q.raw_municipality, m.muni_name
    `);
    res.send({ pie_data });
  } catch (e) {
    console.error(e);
    res.status(500).send('Server error');
  }
});

router.get('/line_expected_harvest', async (req, res) => {
  try {
    const [line_expected_harvest] = await db.query(`
      SELECT ROUND(SUM(raw_population),2) AS expected_harvest,
             DATE_FORMAT(raw_dharvest, '%b') AS date_harvest
      FROM qp_farmer_raw
      WHERE YEAR(raw_dharvest) = YEAR(CURDATE())
      GROUP BY MONTH(raw_dharvest)
      ORDER BY MONTH(raw_dharvest)
    `);
    res.send({ line_expected_harvest });
  } catch (e) {
    console.error(e);
    res.status(500).send('Server error');
  }
});

router.get('/qp_harvest/:mun', async (req, res) => {
  try {
    const muni = req.params.mun;
    const [qp_harvest] = await db.query(
      `
      SELECT TRUNCATE(SUM(Production),2) AS production_report,
             YEAR(year_gathered) AS year_gathered_1
      FROM harvest_data
      WHERE Municipality = ?
      GROUP BY YEAR(year_gathered)
      ORDER BY YEAR(year_gathered)
      `,
      [muni]
    );
    res.send({ qp_harvest });
  } catch (e) {
    console.error(e);
    res.status(500).send('Server error');
  }
});

router.get('/harvest_count/:year', async (req, res) => {
  try {
    const year = Number(req.params.year);

    const [harvest_count] = await db.query(
      `
      SELECT TRUNCATE(SUM(Production),2) AS production_report,
             MONTHNAME(year_gathered) AS month_gathered,
             Municipality,
             YEAR(year_gathered) AS year_val
      FROM harvest_data
      WHERE YEAR(year_gathered) = ?
      GROUP BY Municipality, MONTH(year_gathered), YEAR(year_gathered)
      ORDER BY Municipality, MONTH(year_gathered)
      `,
      [year]
    );

    res.send({ harvest_count });
  } catch (e) {
    console.error(e);
    res.status(500).send('Server error');
  }
});

router.get('/qp_general_data', async (req, res) => {
  try {
    const [qp_price] = await db.query(
      `SELECT AVG(lg_price) AS qp_price, YEAR(date) AS year_
       FROM qp_price
       GROUP BY YEAR(date)
       ORDER BY YEAR(date)`
    );
    const [[farmer_count]] = await db.query('SELECT COUNT(*) AS Farmer_ID FROM farmer_demo');
    const [[area_count]] = await db.query(
      'SELECT TRUNCATE(SUM(raw_area),2) AS Area_count FROM qp_farmer_raw'
    );
    const [[harvest_count]] = await db.query(
      'SELECT TRUNCATE(SUM(Production),2) AS production_count FROM harvest_data'
    );

    res.send({ qp_price, farmer_count, area_count, harvest_count });
  } catch (e) {
    console.error(e);
    res.status(500).send('Server error');
  }
});

module.exports = router;
