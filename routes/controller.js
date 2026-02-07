// services/fetch.js (updated)
const connection = require('../dabatase.js'); // <-- fixed typo

const fetch = {
  // Population by year & municipality (ordered by muni_id length, then id, then year)
  fetch_population: async function () {
    const [rows] = await connection.query(`
      SELECT
        SUM(q.raw_population) AS population,
        YEAR(q.raw_dgathered) AS year_gathered,
        m.muni_name
      FROM qp_farmer_raw AS q
      JOIN tbl_muni AS m
        ON q.raw_municipality = m.muni_id
      GROUP BY YEAR(q.raw_dgathered), q.raw_municipality, m.muni_name
      ORDER BY LENGTH(q.raw_municipality), q.raw_municipality, YEAR(q.raw_dgathered) ASC
    `);
    return rows;
  },

  // General population by Year/Quarter (strict-mode safe)
  fetch_general_pop: async function () {
    const [rows] = await connection.query(`
      SELECT
        SUM(q.raw_population) AS population,
        YEAR(q.raw_dgathered) AS year_gathereds,
        QUARTER(q.raw_dgathered) AS quarters,
        CONCAT(YEAR(MIN(q.raw_dgathered)), ' Q ', QUARTER(MIN(q.raw_dgathered))) AS year_gathered
      FROM qp_farmer_raw AS q
      GROUP BY YEAR(q.raw_dgathered), QUARTER(q.raw_dgathered)
      ORDER BY MIN(q.raw_dgathered) ASC
    `);
    return rows;
  },

  // Area (per year per muni) + union of provincial total, last 5 years; MySQL8-safe
  fetch_area_all: async function () {
    const [rows] = await connection.query(`
      SELECT sum_area_year, year_gathered, muni_name
      FROM (
        SELECT
          TRUNCATE(SUM(q.raw_area), 2) AS sum_area_year,
          YEAR(q.raw_dgathered) AS year_gathered,
          m.muni_name
        FROM qp_farmer_raw AS q
        JOIN tbl_muni AS m
          ON q.raw_municipality = m.muni_id
        WHERE YEAR(q.raw_dgathered) >= YEAR(CURDATE()) - 4
        GROUP BY YEAR(q.raw_dgathered), q.raw_municipality, m.muni_name

        UNION ALL

        SELECT
          TRUNCATE(SUM(q.raw_area), 2) AS sum_area_year,
          YEAR(q.raw_dgathered) AS year_gathered,
          'A Camarines Norte' AS muni_name
        FROM qp_farmer_raw AS q
        WHERE YEAR(q.raw_dgathered) >= YEAR(CURDATE()) - 4
        GROUP BY YEAR(q.raw_dgathered)
      ) t
      ORDER BY t.muni_name, t.year_gathered
    `);
    return rows;
  },

  // Farmers list (demo table)
  fetch_farmers: async function () {
    const [rows] = await connection.query(`
      SELECT
        f.f_id,
        m.muni_name AS municipality,
        b.brgy_name AS barangay,
        CONCAT_WS(' ', f.f_name, f.m_name, f.l_name) AS fullname,
        f.f_gender AS gender
      FROM farmer_demo AS f
      JOIN tbl_muni AS m ON f.f_municipality = m.muni_id
      JOIN tbl_barangay AS b ON f.f_barangay = b.brgy_id
    `);
    return rows;
  },

  // Expected harvest per municipality for current year, ranked (window needs subquery)
  fetch_expected_harvest: async function () {
    const [rows] = await connection.query(`
      SELECT
        t.expected_harvest,
        t.muni_name,
        ROW_NUMBER() OVER (ORDER BY t.expected_harvest DESC) AS ranking
      FROM (
        SELECT
          ROUND(SUM(q.raw_population), 2) AS expected_harvest,
          m.muni_name
        FROM qp_farmer_raw AS q
        JOIN tbl_muni AS m ON q.raw_municipality = m.muni_id
        WHERE YEAR(q.raw_dharvest) = YEAR(CURDATE())
        GROUP BY q.raw_municipality, m.muni_name
      ) AS t
      ORDER BY t.expected_harvest DESC
    `);
    return rows;
  },

  // Top producer (same as expected_harvest; keep for API parity)
  fetch_top_producer: async function () {
    const [rows] = await connection.query(`
      SELECT
        t.expected_harvest,
        t.muni_name,
        ROW_NUMBER() OVER (ORDER BY t.expected_harvest DESC) AS ranking
      FROM (
        SELECT
          ROUND(SUM(q.raw_population), 2) AS expected_harvest,
          m.muni_name
        FROM qp_farmer_raw AS q
        JOIN tbl_muni AS m ON q.raw_municipality = m.muni_id
        WHERE YEAR(q.raw_dharvest) = YEAR(CURDATE())
        GROUP BY q.raw_municipality, m.muni_name
      ) AS t
      ORDER BY t.expected_harvest DESC
    `);
    return rows;
  },

  // Area ranking with window function (needs subquery)
  fetch_area: async function () {
    const [rows] = await connection.query(`
      SELECT
        t.muni_name,
        t.sum_area,
        ROW_NUMBER() OVER (ORDER BY t.sum_area DESC) AS area_rank
      FROM (
        SELECT
          m.muni_name,
          TRUNCATE(SUM(q.raw_area), 2) AS sum_area
        FROM qp_farmer_raw AS q
        JOIN tbl_muni AS m ON q.raw_municipality = m.muni_id
        GROUP BY q.raw_municipality, m.muni_name
      ) AS t
      ORDER BY t.sum_area DESC
    `);
    return rows;
  },

  // Farmer count per municipality
  fetch_farmer_permuni: async function () {
    const [rows] = await connection.query(`
      SELECT
        COUNT(DISTINCT CONCAT_WS('|', q.raw_fname, q.raw_mname, q.raw_lname)) AS farmer_count_per_muni,
        m.muni_name
      FROM qp_farmer_raw AS q
      JOIN tbl_muni AS m ON q.raw_municipality = m.muni_id
      GROUP BY q.raw_municipality, m.muni_name
      ORDER BY farmer_count_per_muni ASC
    `);
    return rows;
  },

  // Farmer count per year
  fetch_farmer_peryear: async function () {
    const [rows] = await connection.query(`
      SELECT
        COUNT(DISTINCT CONCAT_WS('|', q.raw_fname, q.raw_mname, q.raw_lname)) AS farmer_count_per_year,
        YEAR(q.raw_dgathered) AS year_gathered
      FROM qp_farmer_raw AS q
      JOIN tbl_muni AS m ON q.raw_municipality = m.muni_id
      GROUP BY YEAR(q.raw_dgathered)
      ORDER BY year_gathered ASC
    `);
    return rows;
  },

  // Farmer count per year for a given municipality name (param)
  fetch_farmer_peryear_permuni: async function (muniName) {
    const [rows] = await connection.query(
      `
      SELECT
        COUNT(DISTINCT CONCAT_WS('|', q.raw_fname, q.raw_mname, q.raw_lname)) AS farmer_count_per_year,
        YEAR(q.raw_dgathered) AS year_gathered,
        m.muni_name
      FROM qp_farmer_raw AS q
      JOIN tbl_muni AS m ON q.raw_municipality = m.muni_id
      WHERE m.muni_name = ?
      GROUP BY YEAR(q.raw_dgathered), m.muni_name
      ORDER BY year_gathered ASC
      `,
      [muniName]
    );
    return rows;
  },

  // Harvest data per municipality and year (your other table)
  fetch_harvest_permuni: async function () {
    const [rows] = await connection.query(`
      SELECT
        TRUNCATE(SUM(h.Production), 2) AS production_report,
        h.Municipality,
        YEAR(h.year_gathered) AS year_gathered_1
      FROM harvest_data AS h
      GROUP BY YEAR(h.year_gathered), h.Municipality
      ORDER BY h.Municipality, YEAR(h.year_gathered)
    `);
    return rows;
  },

  // RBSBA status totals
  fetch_rbsba_status: async function () {
    const [rows] = await connection.query(`
      SELECT
        notregistered.notregistered_count,
        registered.registered_count
      FROM (
        SELECT COUNT(DISTINCT CONCAT_WS('|', raw_fname, raw_mname, raw_lname)) AS notregistered_count
        FROM qp_farmer_raw
        WHERE COALESCE(RBSBA, '') = ''
      ) AS notregistered
      JOIN (
        SELECT COUNT(DISTINCT CONCAT_WS('|', raw_fname, raw_mname, raw_lname)) AS registered_count
        FROM qp_farmer_raw
        WHERE COALESCE(RBSBA, '') <> ''
      ) AS registered
    `);
    return rows;
  },

  // RBSBA percent per municipality
  fetch_rbsba_percent: async function () {
    const [rows] = await connection.query(`
      SELECT
        TRUNCATE((t1.registered_count / t2.total_num) * 100, 1) AS registered,
        t1.muni_name,
        t1.registered_count,
        t2.total_num
      FROM (
        SELECT
          COUNT(DISTINCT CONCAT_WS('|', q.raw_fname, q.raw_mname, q.raw_lname)) AS registered_count,
          m.muni_name,
          q.raw_municipality
        FROM qp_farmer_raw AS q
        JOIN tbl_muni AS m ON q.raw_municipality = m.muni_id
        WHERE COALESCE(q.RBSBA, '') <> ''
        GROUP BY q.raw_municipality, m.muni_name
      ) AS t1
      JOIN (
        SELECT
          COUNT(DISTINCT CONCAT_WS('|', raw_fname, raw_mname, raw_lname)) AS total_num,
          raw_municipality
        FROM qp_farmer_raw
        GROUP BY raw_municipality
      ) AS t2
        ON t1.raw_municipality = t2.raw_municipality
      ORDER BY t1.muni_name
    `);
    return rows;
  },

  // RBSBA percent per year (registered / total, with unregistered too)
  fetch_rbsba_per_year: async function () {
    const [rows] = await connection.query(`
      SELECT
        TRUNCATE((t1.registered_count / t2.total_num) * 100, 1) AS registered,
        t1.year_dg1,
        t1.registered_count,
        t3.unregistered_count,
        t2.total_num
      FROM (
        SELECT
          COUNT(DISTINCT CONCAT_WS('|', raw_fname, raw_mname, raw_lname)) AS registered_count,
          YEAR(raw_dgathered) AS year_dg1
        FROM qp_farmer_raw
        WHERE COALESCE(RBSBA, '') <> ''
        GROUP BY YEAR(raw_dgathered)
      ) AS t1
      JOIN (
        SELECT
          COUNT(DISTINCT CONCAT_WS('|', raw_fname, raw_mname, raw_lname)) AS total_num,
          YEAR(raw_dgathered) AS year_dg2
        FROM qp_farmer_raw
        GROUP BY YEAR(raw_dgathered)
      ) AS t2
        ON t1.year_dg1 = t2.year_dg2
      JOIN (
        SELECT
          COUNT(DISTINCT CONCAT_WS('|', raw_fname, raw_mname, raw_lname)) AS unregistered_count,
          YEAR(raw_dgathered) AS year_dg3
        FROM qp_farmer_raw
        WHERE COALESCE(RBSBA, '') = ''
        GROUP BY YEAR(raw_dgathered)
      ) AS t3
        ON t1.year_dg1 = t3.year_dg3
      ORDER BY t1.year_dg1
    `);
    return rows;
  },

  // RBSBA table per municipality with percentages
  fetch_rbsba_table: async function () {
    const [rows] = await connection.query(`
      SELECT
        t1.rbsba_registered,
        t2.rbsba_unregistered,
        t3.total_num,
        TRUNCATE((t1.rbsba_registered / t3.total_num) * 100, 2) AS registred_percentage,
        TRUNCATE((t2.rbsba_unregistered / t3.total_num) * 100, 2) AS unregistred_percentage,
        t1.muni_name
      FROM (
        SELECT
          COUNT(DISTINCT CONCAT_WS('|', q.raw_fname, q.raw_mname, q.raw_lname)) AS rbsba_registered,
          m.muni_name,
          q.raw_municipality
        FROM qp_farmer_raw AS q
        JOIN tbl_muni AS m ON q.raw_municipality = m.muni_id
        WHERE COALESCE(q.RBSBA, '') <> ''
        GROUP BY q.raw_municipality, m.muni_name
      ) AS t1
      JOIN (
        SELECT
          COUNT(DISTINCT CONCAT_WS('|', raw_fname, raw_mname, raw_lname)) AS rbsba_unregistered,
          raw_municipality
        FROM qp_farmer_raw
        WHERE COALESCE(RBSBA, '') = ''
        GROUP BY raw_municipality
      ) AS t2
        ON t1.raw_municipality = t2.raw_municipality
      JOIN (
        SELECT
          COUNT(DISTINCT CONCAT_WS('|', raw_fname, raw_mname, raw_lname)) AS total_num,
          raw_municipality
        FROM qp_farmer_raw
        GROUP BY raw_municipality
      ) AS t3
        ON t1.raw_municipality = t3.raw_municipality
      ORDER BY t1.muni_name
    `);
    return rows;
  },

  // RBSBA per muni (registered vs unregistered)
  fetch_rbsba_per_muni: async function () {
    const [rows] = await connection.query(`
      SELECT
        t1.rbsba_registered,
        t2.rbsba_unregistered,
        t1.muni_name
      FROM (
        SELECT
          COUNT(DISTINCT CONCAT_WS('|', q.raw_fname, q.raw_mname, q.raw_lname)) AS rbsba_registered,
          m.muni_name,
          q.raw_municipality
        FROM qp_farmer_raw AS q
        JOIN tbl_muni AS m ON q.raw_municipality = m.muni_id
        WHERE COALESCE(q.RBSBA, '') <> ''
        GROUP BY q.raw_municipality, m.muni_name
      ) AS t1
      JOIN (
        SELECT
          COUNT(DISTINCT CONCAT_WS('|', raw_fname, raw_mname, raw_lname)) AS rbsba_unregistered,
          raw_municipality
        FROM qp_farmer_raw
        WHERE COALESCE(RBSBA, '') = ''
        GROUP BY raw_municipality
      ) AS t2
        ON t1.raw_municipality = t2.raw_municipality
      ORDER BY t1.rbsba_registered DESC, t1.muni_name
    `);
    return rows;
  },

  // Male vs Female per year (join on year)
  fetch_gender_line: async function () {
    const [rows] = await connection.query(`
      SELECT
        tM.year_dg,
        tM.male_count,
        tF.female_count
      FROM (
        SELECT
          YEAR(raw_dgathered) AS year_dg,
          COUNT(DISTINCT CONCAT_WS('|', raw_fname, raw_mname, raw_lname)) AS male_count
        FROM qp_farmer_raw
        WHERE raw_gender = 'M'
        GROUP BY YEAR(raw_dgathered)
      ) AS tM
      JOIN (
        SELECT
          YEAR(raw_dgathered) AS year_dg,
          COUNT(DISTINCT CONCAT_WS('|', raw_fname, raw_mname, raw_lname)) AS female_count
        FROM qp_farmer_raw
        WHERE raw_gender = 'F'
        GROUP BY YEAR(raw_dgathered)
      ) AS tF
        ON tM.year_dg = tF.year_dg
      ORDER BY tM.year_dg ASC
    `);
    return rows;
  },

  // Tenurial classification counts per municipality
  fetch_farmer_classification: async function () {
    const [rows] = await connection.query(`
      SELECT
        t_all.all_,
        t_tenant.tenant,
        t_cultivator.cultivator,
        t_owner.owner,
        t_lesse.lesse,
        t_renting.renting,
        t_co_owner.co_owner,
        t_all.muni_name
      FROM (
        SELECT
          COUNT(DISTINCT CONCAT_WS('|', raw_fname, raw_mname, raw_lname)) AS all_,
          m.muni_name,
          q.raw_municipality
        FROM qp_farmer_raw AS q
        JOIN tbl_muni AS m ON q.raw_municipality = m.muni_id
        WHERE COALESCE(q.tenurial, '') = ''
        GROUP BY q.raw_municipality, m.muni_name
      ) AS t_all
      LEFT JOIN (
        SELECT COUNT(DISTINCT CONCAT_WS('|', raw_fname, raw_mname, raw_lname)) AS tenant, raw_municipality
        FROM qp_farmer_raw
        WHERE tenurial = 'Tenant'
        GROUP BY raw_municipality
      ) AS t_tenant ON t_all.raw_municipality = t_tenant.raw_municipality
      LEFT JOIN (
        SELECT COUNT(DISTINCT CONCAT_WS('|', raw_fname, raw_mname, raw_lname)) AS cultivator, raw_municipality
        FROM qp_farmer_raw
        WHERE tenurial = 'Cultivator'
        GROUP BY raw_municipality
      ) AS t_cultivator ON t_all.raw_municipality = t_cultivator.raw_municipality
      LEFT JOIN (
        SELECT COUNT(DISTINCT CONCAT_WS('|', raw_fname, raw_mname, raw_lname)) AS owner, raw_municipality
        FROM qp_farmer_raw
        WHERE tenurial = 'Owner'
        GROUP BY raw_municipality
      ) AS t_owner ON t_all.raw_municipality = t_owner.raw_municipality
      LEFT JOIN (
        SELECT COUNT(DISTINCT CONCAT_WS('|', raw_fname, raw_mname, raw_lname)) AS lesse, raw_municipality
        FROM qp_farmer_raw
        WHERE tenurial = 'Lesse'
        GROUP BY raw_municipality
      ) AS t_lesse ON t_all.raw_municipality = t_lesse.raw_municipality
      LEFT JOIN (
        SELECT COUNT(DISTINCT CONCAT_WS('|', raw_fname, raw_mname, raw_lname)) AS renting, raw_municipality
        FROM qp_farmer_raw
        WHERE tenurial = 'Renting'
        GROUP BY raw_municipality
      ) AS t_renting ON t_all.raw_municipality = t_renting.raw_municipality
      LEFT JOIN (
        SELECT COUNT(DISTINCT CONCAT_WS('|', raw_fname, raw_mname, raw_lname)) AS co_owner, raw_municipality
        FROM qp_farmer_raw
        WHERE tenurial = 'Co-Owner'
        GROUP BY raw_municipality
      ) AS t_co_owner ON t_all.raw_municipality = t_co_owner.raw_municipality
      ORDER BY t_all.muni_name
    `);
    return rows;
  },

  // Gender totals per municipality (demo table)
  fetch_gender_data: async function () {
    const [rows] = await connection.query(`
      SELECT
        m.muni_name AS f_municipality,
        SUM(f.f_gender = 'M') AS Male,
        SUM(f.f_gender = 'F') AS Female,
        SUM(f.f_gender = 'M') + SUM(f.f_gender = 'F') AS total
      FROM farmer_demo AS f
      JOIN tbl_muni AS m ON f.f_municipality = m.muni_id
      GROUP BY f.f_municipality, m.muni_name
      ORDER BY total
    `);
    return rows;
  },

  // Donut gender totals (demo table)
  fetch_gender_data_total: async function () {
    const [rows] = await connection.query(`
      SELECT
        SUM(f_gender = 'M') AS Male,
        SUM(f_gender = 'F') AS Female,
        TRUNCATE(SUM(f_gender = 'M') / NULLIF(SUM(f_gender = 'M') + SUM(f_gender = 'F'), 0) * 100, 2) AS male_percent,
        TRUNCATE(SUM(f_gender = 'F') / NULLIF(SUM(f_gender = 'M') + SUM(f_gender = 'F'), 0) * 100, 2) AS female_percent
      FROM farmer_demo
    `);
    return rows;
  },

  // Pests/Diseases/Weeds (window uses direct columns)
  fetch_pest_data: async function () {
    const [rows] = await connection.query(`
      SELECT ROW_NUMBER() OVER (ORDER BY id) AS count_, name, description, percent
      FROM pests
      WHERE category = 'Pests'
    `);
    return rows;
  },
  fetch_diseases_data: async function () {
    const [rows] = await connection.query(`
      SELECT ROW_NUMBER() OVER (ORDER BY id) AS count_, name, description, percent
      FROM pests
      WHERE category = 'Diseases'
    `);
    return rows;
  },
  fetch_weeds_data: async function () {
    const [rows] = await connection.query(`
      SELECT ROW_NUMBER() OVER (ORDER BY id) AS count_, name, description, percent
      FROM pests
      WHERE category = 'Weeds'
    `);
    return rows;
  },

  // Area line per year
  fetch_area_line: async function () {
    const [rows] = await connection.query(`
      SELECT
        TRUNCATE(SUM(raw_area), 2) AS sum_area_year,
        YEAR(raw_dgathered) AS year_gathered
      FROM qp_farmer_raw
      GROUP BY YEAR(raw_dgathered)
      ORDER BY YEAR(raw_dgathered)
    `);
    return rows;
  },

  // Age stacked (female/male) via UNION ALL (left as-is but formatted)
  fetch_age_stacked_female: async function () {
    const [rows] = await connection.query(`
      SELECT count_, range_, f_gender FROM twenty_five_  WHERE f_gender = 'F'
      UNION ALL
      SELECT count_, range_, f_gender FROM thirty_five_  WHERE f_gender = 'F'
      UNION ALL
      SELECT count_, range_, f_gender FROM forty_five_   WHERE f_gender = 'F'
      UNION ALL
      SELECT count_, range_, f_gender FROM fifty_five_   WHERE f_gender = 'F'
      UNION ALL
      SELECT count_, range_, f_gender FROM sixty_five_   WHERE f_gender = 'F'
      UNION ALL
      SELECT count_, range_, f_gender FROM seventy_five_ WHERE f_gender = 'F'
      UNION ALL
      SELECT count_, range_, f_gender FROM eighty_five_  WHERE f_gender = 'F'
    `);
    return rows;
  },

  fetch_age_stacked_male: async function () {
    const [rows] = await connection.query(`
      SELECT count_, range_, f_gender FROM twenty_five_  WHERE f_gender = 'M'
      UNION ALL
      SELECT count_, range_, f_gender FROM thirty_five_  WHERE f_gender = 'M'
      UNION ALL
      SELECT count_, range_, f_gender FROM forty_five_   WHERE f_gender = 'M'
      UNION ALL
      SELECT count_, range_, f_gender FROM fifty_five_   WHERE f_gender = 'M'
      UNION ALL
      SELECT count_, range_, f_gender FROM sixty_five_   WHERE f_gender = 'M'
      UNION ALL
      SELECT count_, range_, f_gender FROM seventy_five_ WHERE f_gender = 'M'
      UNION ALL
      SELECT count_, range_, f_gender FROM eighty_five_  WHERE f_gender = 'M'
      UNION ALL
      SELECT count_, range_, f_gender FROM ninety_five_  WHERE f_gender = 'M'
    `);
    return rows;
  },
};

module.exports = fetch;
