/**
 * ═══════════════════════════════════════════════════════════════
 * HAWK — Predictive Deal Velocity Engine (Dashboard Routes)
 * Zenith OS
 * ═══════════════════════════════════════════════════════════════
 * 
 * Endpoints:
 *   GET  /hawk                        → Dashboard view
 *   GET  /api/hawk/migration/summary  → Migration intelligence summary
 *   GET  /api/hawk/migration/inflows  → Top inflow origins
 *   GET  /api/hawk/migration/outflows → Top outflow destinations
 *   GET  /api/hawk/sba/summary        → SBA loan summary
 *   GET  /api/hawk/sba/loans          → SBA loan list (paginated)
 *   GET  /api/hawk/sba/sectors        → SBA loans by NAICS sector
 *   GET  /api/hawk/overview           → Combined dashboard stats
 * 
 * Main Street Group Technology Division
 * Christ is King
 * ═══════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// ═══════════════════════════════════════════════════════════════
// MIDDLEWARE — Auth check
// ═══════════════════════════════════════════════════════════════

function requireAuth(req, res, next) {
    if (req.session && req.session.user) return next();
    res.redirect('/auth/login');
}

// ═══════════════════════════════════════════════════════════════
// PAGE ROUTE — Dashboard View
// ═══════════════════════════════════════════════════════════════

router.get('/', requireAuth, (req, res) => {
    res.render('hawk', {
        title: 'HAWK — Deal Velocity Engine',
        user: req.session.user,
        activePage: 'hawk',
        theme: req.session.user ? req.session.user.theme : 'light',
        org: req.session.org || null
    });
});

// ═══════════════════════════════════════════════════════════════
// API: Overview Stats
// ═══════════════════════════════════════════════════════════════

router.get('/api/overview', requireAuth, async (req, res) => {
    try {

        const [migrationStats, sbaStats, countyBreakdown] = await Promise.all([
            // Migration totals
            pool.query(`
                SELECT 
                    COUNT(*) as total_records,
                    SUM(CASE WHEN direction = 'inflow' THEN returns ELSE 0 END) as total_inflow_returns,
                    SUM(CASE WHEN direction = 'outflow' THEN returns ELSE 0 END) as total_outflow_returns,
                    SUM(CASE WHEN direction = 'inflow' THEN agi ELSE 0 END) as total_inflow_agi,
                    SUM(CASE WHEN direction = 'outflow' THEN agi ELSE 0 END) as total_outflow_agi,
                    COUNT(DISTINCT tax_year) as years_covered,
                    MIN(tax_year) as earliest_year,
                    MAX(tax_year) as latest_year
                FROM hawk_migration_data
            `),
            // SBA totals
            pool.query(`
                SELECT 
                    COUNT(*) as total_loans,
                    SUM(approval_amount) as total_funded,
                    AVG(approval_amount) as avg_loan,
                    SUM(jobs_supported) as total_jobs,
                    COUNT(DISTINCT county) as counties_covered,
                    COUNT(DISTINCT naics_code) as sectors_covered,
                    MIN(approval_date) as earliest_loan,
                    MAX(approval_date) as latest_loan
                FROM hawk_sba_loans
            `),
            // County breakdown for migration
            pool.query(`
                SELECT 
                    dest_county_name as county,
                    SUM(CASE WHEN direction = 'inflow' THEN returns ELSE 0 END) as inflows,
                    SUM(CASE WHEN direction = 'outflow' THEN returns ELSE 0 END) as outflows,
                    SUM(CASE WHEN direction = 'inflow' THEN agi ELSE 0 END) as inflow_agi,
                    SUM(CASE WHEN direction = 'outflow' THEN agi ELSE 0 END) as outflow_agi
                FROM hawk_migration_data
                WHERE dest_county_name IS NOT NULL
                GROUP BY dest_county_name
                ORDER BY inflows DESC
                LIMIT 12
            `)
        ]);

        const migration = migrationStats.rows[0];
        const sba = sbaStats.rows[0];

        res.json({
            success: true,
            migration: {
                total_records: parseInt(migration.total_records),
                net_inflow_returns: parseInt(migration.total_inflow_returns) - parseInt(migration.total_outflow_returns),
                total_inflow_returns: parseInt(migration.total_inflow_returns),
                total_outflow_returns: parseInt(migration.total_outflow_returns),
                net_agi: parseFloat(migration.total_inflow_agi) - parseFloat(migration.total_outflow_agi),
                total_inflow_agi: parseFloat(migration.total_inflow_agi),
                total_outflow_agi: parseFloat(migration.total_outflow_agi),
                years_covered: parseInt(migration.years_covered),
                period: `${migration.earliest_year}–${migration.latest_year}`
            },
            sba: {
                total_loans: parseInt(sba.total_loans),
                total_funded: parseFloat(sba.total_funded),
                avg_loan: parseFloat(sba.avg_loan),
                total_jobs: parseInt(sba.total_jobs),
                counties_covered: parseInt(sba.counties_covered),
                sectors_covered: parseInt(sba.sectors_covered),
                period: sba.earliest_loan && sba.latest_loan 
                    ? `${new Date(sba.earliest_loan).getFullYear()}–${new Date(sba.latest_loan).getFullYear()}`
                    : 'N/A'
            },
            county_breakdown: countyBreakdown.rows.map(r => ({
                county: r.county,
                inflows: parseInt(r.inflows),
                outflows: parseInt(r.outflows),
                net: parseInt(r.inflows) - parseInt(r.outflows),
                inflow_agi: parseFloat(r.inflow_agi),
                outflow_agi: parseFloat(r.outflow_agi),
                net_agi: parseFloat(r.inflow_agi) - parseFloat(r.outflow_agi)
            }))
        });
    } catch (err) {
        console.error('[HAWK] Overview error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// API: Migration Summary
// ═══════════════════════════════════════════════════════════════

router.get('/api/migration/summary', requireAuth, async (req, res) => {
    try {
        const { county, year } = req.query;

        let whereClause = 'WHERE 1=1';
        const params = [];
        let paramIdx = 1;

        if (county) {
            whereClause += ` AND (dest_county_name ILIKE $${paramIdx} OR origin_county_name ILIKE $${paramIdx})`;
            params.push(`%${county}%`);
            paramIdx++;
        }
        if (year) {
            whereClause += ` AND tax_year = $${paramIdx}`;
            params.push(parseInt(year));
            paramIdx++;
        }

        const result = await pool.query(`
            SELECT 
                tax_year,
                direction,
                SUM(returns) as total_returns,
                SUM(exemptions) as total_exemptions,
                SUM(agi) as total_agi,
                COUNT(*) as record_count
            FROM hawk_migration_data
            ${whereClause}
            GROUP BY tax_year, direction
            ORDER BY tax_year DESC, direction
        `, params);

        // Group by year
        const byYear = {};
        result.rows.forEach(r => {
            if (!byYear[r.tax_year]) {
                byYear[r.tax_year] = { year: r.tax_year, inflow: {}, outflow: {} };
            }
            byYear[r.tax_year][r.direction] = {
                returns: parseInt(r.total_returns),
                exemptions: parseInt(r.total_exemptions),
                agi: parseFloat(r.total_agi),
                records: parseInt(r.record_count)
            };
        });

        const years = Object.values(byYear).map(y => ({
            year: y.year,
            inflow_returns: y.inflow.returns || 0,
            outflow_returns: y.outflow.returns || 0,
            net_returns: (y.inflow.returns || 0) - (y.outflow.returns || 0),
            inflow_agi: y.inflow.agi || 0,
            outflow_agi: y.outflow.agi || 0,
            net_agi: (y.inflow.agi || 0) - (y.outflow.agi || 0)
        }));

        res.json({ success: true, data: years });
    } catch (err) {
        console.error('[HAWK] Migration summary error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// API: Top Inflow Origins
// ═══════════════════════════════════════════════════════════════

router.get('/api/migration/inflows', requireAuth, async (req, res) => {
    try {
        const { county, year, limit = 20 } = req.query;

        let whereClause = "WHERE direction = 'inflow'";
        const params = [];
        let paramIdx = 1;

        if (county) {
            whereClause += ` AND dest_county_name ILIKE $${paramIdx}`;
            params.push(`%${county}%`);
            paramIdx++;
        }
        if (year) {
            whereClause += ` AND tax_year = $${paramIdx}`;
            params.push(parseInt(year));
            paramIdx++;
        }

        params.push(parseInt(limit));

        const result = await pool.query(`
            SELECT 
                origin_state_name,
                origin_county_name,
                dest_county_name,
                SUM(returns) as total_returns,
                SUM(exemptions) as total_exemptions,
                SUM(agi) as total_agi,
                ROUND(AVG(avg_agi_per_return), 2) as avg_agi_per_return
            FROM hawk_migration_data
            ${whereClause}
            GROUP BY origin_state_name, origin_county_name, dest_county_name
            ORDER BY total_returns DESC
            LIMIT $${paramIdx}
        `, params);

        res.json({
            success: true,
            data: result.rows.map(r => ({
                origin: r.origin_county_name 
                    ? `${r.origin_county_name}, ${r.origin_state_name}`
                    : r.origin_state_name,
                origin_state: r.origin_state_name,
                origin_county: r.origin_county_name,
                destination: r.dest_county_name,
                returns: parseInt(r.total_returns),
                exemptions: parseInt(r.total_exemptions),
                agi: parseFloat(r.total_agi),
                avg_agi: parseFloat(r.avg_agi_per_return)
            }))
        });
    } catch (err) {
        console.error('[HAWK] Inflows error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// API: Top Outflow Destinations
// ═══════════════════════════════════════════════════════════════

router.get('/api/migration/outflows', requireAuth, async (req, res) => {
    try {
        const { county, year, limit = 20 } = req.query;

        let whereClause = "WHERE direction = 'outflow'";
        const params = [];
        let paramIdx = 1;

        if (county) {
            whereClause += ` AND origin_county_name ILIKE $${paramIdx}`;
            params.push(`%${county}%`);
            paramIdx++;
        }
        if (year) {
            whereClause += ` AND tax_year = $${paramIdx}`;
            params.push(parseInt(year));
            paramIdx++;
        }

        params.push(parseInt(limit));

        const result = await pool.query(`
            SELECT 
                dest_state_name,
                dest_county_name,
                origin_county_name,
                SUM(returns) as total_returns,
                SUM(exemptions) as total_exemptions,
                SUM(agi) as total_agi,
                ROUND(AVG(avg_agi_per_return), 2) as avg_agi_per_return
            FROM hawk_migration_data
            ${whereClause}
            GROUP BY dest_state_name, dest_county_name, origin_county_name
            ORDER BY total_returns DESC
            LIMIT $${paramIdx}
        `, params);

        res.json({
            success: true,
            data: result.rows.map(r => ({
                destination: r.dest_county_name 
                    ? `${r.dest_county_name}, ${r.dest_state_name}`
                    : r.dest_state_name,
                dest_state: r.dest_state_name,
                dest_county: r.dest_county_name,
                origin: r.origin_county_name,
                returns: parseInt(r.total_returns),
                exemptions: parseInt(r.total_exemptions),
                agi: parseFloat(r.total_agi),
                avg_agi: parseFloat(r.avg_agi_per_return)
            }))
        });
    } catch (err) {
        console.error('[HAWK] Outflows error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// API: SBA Loan Summary
// ═══════════════════════════════════════════════════════════════

router.get('/api/sba/summary', requireAuth, async (req, res) => {
    try {
        const { county } = req.query;

        let whereClause = '';
        const params = [];

        if (county) {
            whereClause = 'WHERE county ILIKE $1';
            params.push(`%${county}%`);
        }

        const [byCounty, byProgram, byYear] = await Promise.all([
            pool.query(`
                SELECT 
                    county,
                    COUNT(*) as loan_count,
                    SUM(approval_amount) as total_funded,
                    AVG(approval_amount) as avg_loan,
                    SUM(jobs_supported) as total_jobs
                FROM hawk_sba_loans
                ${whereClause}
                GROUP BY county
                ORDER BY total_funded DESC
            `, params),
            pool.query(`
                SELECT 
                    program,
                    COUNT(*) as loan_count,
                    SUM(approval_amount) as total_funded,
                    AVG(approval_amount) as avg_loan
                FROM hawk_sba_loans
                ${whereClause}
                GROUP BY program
                ORDER BY total_funded DESC
            `, params),
            pool.query(`
                SELECT 
                    EXTRACT(YEAR FROM approval_date) as year,
                    COUNT(*) as loan_count,
                    SUM(approval_amount) as total_funded,
                    SUM(jobs_supported) as total_jobs
                FROM hawk_sba_loans
                ${whereClause}
                GROUP BY EXTRACT(YEAR FROM approval_date)
                ORDER BY year DESC
            `, params)
        ]);

        res.json({
            success: true,
            by_county: byCounty.rows.map(r => ({
                county: r.county,
                loans: parseInt(r.loan_count),
                total_funded: parseFloat(r.total_funded),
                avg_loan: parseFloat(r.avg_loan),
                jobs: parseInt(r.total_jobs)
            })),
            by_program: byProgram.rows.map(r => ({
                program: r.program,
                loans: parseInt(r.loan_count),
                total_funded: parseFloat(r.total_funded),
                avg_loan: parseFloat(r.avg_loan)
            })),
            by_year: byYear.rows.map(r => ({
                year: parseInt(r.year),
                loans: parseInt(r.loan_count),
                total_funded: parseFloat(r.total_funded),
                jobs: parseInt(r.total_jobs)
            }))
        });
    } catch (err) {
        console.error('[HAWK] SBA summary error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// API: SBA Loans (Paginated, Searchable)
// ═══════════════════════════════════════════════════════════════

router.get('/api/sba/loans', requireAuth, async (req, res) => {
    try {
        const { county, search, naics, program, page = 1, limit = 50, sort = 'approval_amount', order = 'DESC' } = req.query;

        let whereClause = 'WHERE 1=1';
        const params = [];
        let paramIdx = 1;

        if (county) {
            whereClause += ` AND county ILIKE $${paramIdx}`;
            params.push(`%${county}%`);
            paramIdx++;
        }
        if (search) {
            whereClause += ` AND (borrower_name ILIKE $${paramIdx} OR borrower_address ILIKE $${paramIdx} OR borrower_city ILIKE $${paramIdx} OR naics_description ILIKE $${paramIdx})`;
            params.push(`%${search}%`);
            paramIdx++;
        }
        if (naics) {
            whereClause += ` AND naics_code = $${paramIdx}`;
            params.push(naics);
            paramIdx++;
        }
        if (program) {
            whereClause += ` AND program = $${paramIdx}`;
            params.push(program);
            paramIdx++;
        }

        // Safe sort columns
        const safeSortCols = ['approval_amount', 'approval_date', 'borrower_name', 'jobs_supported', 'county'];
        const sortCol = safeSortCols.includes(sort) ? sort : 'approval_amount';
        const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        const offset = (parseInt(page) - 1) * parseInt(limit);

        const [countResult, dataResult] = await Promise.all([
            pool.query(`SELECT COUNT(*) as total FROM hawk_sba_loans ${whereClause}`, params),
            pool.query(`
                SELECT 
                    id, program, borrower_name, borrower_address, borrower_city,
                    borrower_state, borrower_zip, county, naics_code, naics_description,
                    approval_amount, approval_date, lender_name, jobs_supported
                FROM hawk_sba_loans
                ${whereClause}
                ORDER BY ${sortCol} ${sortOrder}
                LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
            `, [...params, parseInt(limit), offset])
        ]);

        res.json({
            success: true,
            total: parseInt(countResult.rows[0].total),
            page: parseInt(page),
            limit: parseInt(limit),
            pages: Math.ceil(parseInt(countResult.rows[0].total) / parseInt(limit)),
            data: dataResult.rows
        });
    } catch (err) {
        console.error('[HAWK] SBA loans error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// API: SBA Loans by NAICS Sector
// ═══════════════════════════════════════════════════════════════

router.get('/api/sba/sectors', requireAuth, async (req, res) => {
    try {
        const { county } = req.query;

        let whereClause = '';
        const params = [];

        if (county) {
            whereClause = 'WHERE county ILIKE $1';
            params.push(`%${county}%`);
        }

        const result = await pool.query(`
            SELECT 
                naics_code,
                naics_description,
                COUNT(*) as loan_count,
                SUM(approval_amount) as total_funded,
                AVG(approval_amount) as avg_loan,
                SUM(jobs_supported) as total_jobs,
                MIN(approval_date) as earliest,
                MAX(approval_date) as latest
            FROM hawk_sba_loans
            ${whereClause}
            GROUP BY naics_code, naics_description
            ORDER BY total_funded DESC
            LIMIT 30
        `, params);

        res.json({
            success: true,
            data: result.rows.map(r => ({
                naics_code: r.naics_code,
                sector: r.naics_description,
                loans: parseInt(r.loan_count),
                total_funded: parseFloat(r.total_funded),
                avg_loan: parseFloat(r.avg_loan),
                jobs: parseInt(r.total_jobs)
            }))
        });
    } catch (err) {
        console.error('[HAWK] SBA sectors error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

console.log('[HAWK] Deal Velocity Engine routes registered');

module.exports = router;
