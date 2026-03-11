const express = require('express');
const crypto = require('crypto');
const app = express();
app.use(express.json());

// ==================== CONFIGURATION ====================
// This is your whitelist - add your premium users here
const whitelist = {
    // Format: "LICENSE_KEY" : {
    //   hwid: null,              // Will be set when first used
    //   fingerprint: null,        // For mobile devices
    //   bindingMethod: null,      // 'hwid' or 'fingerprint'
    //   maxDevices: 1,            // How many devices can use this key
    //   note: "description",       // Optional note for you
    //   expires: null             // null = never expires, or "2024-12-31"
    // }
    
    // Add your test key here
    "lucky": {
        hwid: null,
        fingerprint: null,
        bindingMethod: null,
        maxDevices: 1,
        note: "Test key for development",
        expires: null,
        createdAt: new Date().toISOString()
    },
    
    // Add more keys as needed
    "madmoney": {
        hwid: null,
        fingerprint: null,
        bindingMethod: null,
        maxDevices: 1,
        note: "John's personal key",
        expires: null,
        createdAt: new Date().toISOString()
    },
    
    "lessons": {
        hwid: null,
        fingerprint: null,
        bindingMethod: null,
        maxDevices: 2,  // Can use on 2 devices
        note: "Sarah's key (laptop + phone)",
        expires: "2024-12-31",
        createdAt: new Date().toISOString()
    }
};

// Blacklisted HWIDs or fingerprints
const blacklist = {
    // "banned_hwid_here": true,
    // "banned_fingerprint_here": true
};

// Track usage (optional - helps you see who's using your script)
const usageLog = [];
// ========================================================

// Simple hash function
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
}

// Main validation endpoint - Your Roblox script will call this
app.post('/validate', (req, res) => {
    try {
        const { 
            key,
            hwid,
            fingerprint,
            executor,
            platform,
            userId,
            username
        } = req.body;
        
        console.log(`\n🔍 Validation attempt:`);
        console.log(`   Key: ${key}`);
        console.log(`   User: ${username || 'unknown'} (ID: ${userId || 'unknown'})`);
        console.log(`   Platform: ${platform || 'unknown'}`);
        console.log(`   HWID Available: ${hwid ? '✅ YES' : '❌ NO'}`);
        console.log(`   Executor: ${executor || 'unknown'}`);
        
        // Check blacklist first
        if (hwid && blacklist[hwid]) {
            usageLog.push({ key, hwid, status: 'BLACKLISTED_HWID', time: new Date() });
            return res.json({ 
                success: false, 
                message: "This device has been blacklisted" 
            });
        }
        
        if (fingerprint && blacklist[fingerprint]) {
            usageLog.push({ key, fingerprint, status: 'BLACKLISTED_FINGERPRINT', time: new Date() });
            return res.json({ 
                success: false, 
                message: "This device has been blacklisted" 
            });
        }
        
        // Check if key exists
        if (!whitelist[key]) {
            usageLog.push({ key, hwid: hwid || fingerprint, status: 'INVALID_KEY', time: new Date() });
            return res.json({ 
                success: false, 
                message: "Invalid license key" 
            });
        }
        
        const license = whitelist[key];
        
        // Check if expired
        if (license.expires && new Date(license.expires) < new Date()) {
            usageLog.push({ key, hwid: hwid || fingerprint, status: 'EXPIRED', time: new Date() });
            return res.json({ 
                success: false, 
                message: "This license key has expired" 
            });
        }
        
        // CASE 1: Key not bound to anything yet (first time use)
        if (license.bindingMethod === null) {
            // Decide which binding method to use
            if (hwid) {
                // PC with HWID - bind using HWID (most secure)
                license.hwid = hwid;
                license.bindingMethod = 'hwid';
                usageLog.push({ key, hwid, status: 'BOUND_HWID', time: new Date() });
                
                return res.json({ 
                    success: true, 
                    message: "License activated and bound to this PC (HWID)",
                    bindingMethod: 'hwid'
                });
            } 
            else if (fingerprint) {
                // Mobile or no HWID - bind using fingerprint
                license.fingerprint = fingerprint;
                license.bindingMethod = 'fingerprint';
                usageLog.push({ key, fingerprint, status: 'BOUND_FINGERPRINT', time: new Date() });
                
                return res.json({ 
                    success: true, 
                    message: "License activated and bound to this device",
                    bindingMethod: 'fingerprint'
                });
            }
            else {
                return res.json({ 
                    success: false, 
                    message: "Cannot identify your device" 
                });
            }
        }
        
        // CASE 2: Key bound with HWID (PC user)
        if (license.bindingMethod === 'hwid') {
            if (hwid === license.hwid) {
                usageLog.push({ key, hwid, status: 'VALID_HWID', time: new Date() });
                return res.json({ 
                    success: true, 
                    message: "Access granted (HWID verified)",
                    bindingMethod: 'hwid'
                });
            } else {
                usageLog.push({ key, hwid, expected: license.hwid, status: 'HWID_MISMATCH', time: new Date() });
                return res.json({ 
                    success: false, 
                    message: "This license is bound to a different PC" 
                });
            }
        }
        
        // CASE 3: Key bound with fingerprint (mobile user)
        if (license.bindingMethod === 'fingerprint') {
            if (fingerprint === license.fingerprint) {
                usageLog.push({ key, fingerprint, status: 'VALID_FINGERPRINT', time: new Date() });
                return res.json({ 
                    success: true, 
                    message: "Access granted",
                    bindingMethod: 'fingerprint'
                });
            } else {
                usageLog.push({ key, fingerprint, expected: license.fingerprint, status: 'FINGERPRINT_MISMATCH', time: new Date() });
                return res.json({ 
                    success: false, 
                    message: "This license is bound to a different device" 
                });
            }
        }
        
    } catch (error) {
        console.error("Server error:", error);
        res.json({ 
            success: false, 
            message: "Server error" 
        });
    }
});

// Simple home page - shows minimal info for public
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>API Server</title>
            <style>
                body { 
                    font-family: Arial; 
                    background: #1a1a1a; 
                    color: white; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center; 
                    height: 100vh; 
                    margin: 0;
                }
                .card {
                    background: #2d2d2d;
                    padding: 40px;
                    border-radius: 10px;
                    text-align: center;
                }
                h2 { color: #4CAF50; }
                p { color: #888; }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>✅ Server is Running</h2>
                <p>Authentication API active</p>
                <p style="font-size: 12px;">${Object.keys(whitelist).length} licenses configured</p>
            </div>
        </body>
        </html>
    `);
});

// STAFF ONLY - Beautiful Admin Panel
app.get('/admin', (req, res) => {
    const password = req.query.password;
    
    // Check password
    if (password !== "madmoney072") {
        return res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Access Denied</title>
                <style>
                    body {
                        font-family: 'Inter', sans-serif;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        height: 100vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin: 0;
                    }
                    .error-card {
                        background: white;
                        padding: 40px;
                        border-radius: 20px;
                        text-align: center;
                        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                        max-width: 400px;
                    }
                    h1 { color: #ef4444; margin-bottom: 20px; font-size: 28px; }
                    p { color: #666; margin-bottom: 20px; }
                    .lock-icon { font-size: 48px; margin-bottom: 20px; }
                </style>
            </head>
            <body>
                <div class="error-card">
                    <div class="lock-icon">🔒</div>
                    <h1>Access Denied</h1>
                    <p>Invalid admin password. This area is for staff only.</p>
                </div>
            </body>
            </html>
        `);
    }
    
    // Calculate stats
    const totalBound = Object.values(whitelist).filter(l => l.bindingMethod !== null).length;
    const totalPC = Object.values(whitelist).filter(l => l.bindingMethod === 'hwid').length;
    const totalMobile = Object.values(whitelist).filter(l => l.bindingMethod === 'fingerprint').length;
    const expiredKeys = Object.values(whitelist).filter(l => l.expires && new Date(l.expires) < new Date()).length;
    
    // Generate admin panel HTML
    let html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Staff Admin Dashboard</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
                    background: #0f0f0f;
                    color: #fff;
                    padding: 20px;
                }
                
                .container {
                    max-width: 1600px;
                    margin: 0 auto;
                }
                
                /* Header */
                .header {
                    background: linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%);
                    padding: 25px 30px;
                    border-radius: 15px;
                    margin-bottom: 25px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border: 1px solid #333;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                }
                
                .header h1 {
                    font-size: 28px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }
                
                .badge {
                    background: #2d2d2d;
                    padding: 8px 16px;
                    border-radius: 30px;
                    font-size: 14px;
                    color: #888;
                    border: 1px solid #444;
                }
                
                .badge i {
                    color: #4CAF50;
                    margin-right: 5px;
                }
                
                /* Stats Grid */
                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
                    gap: 20px;
                    margin-bottom: 30px;
                }
                
                .stat-card {
                    background: #1a1a1a;
                    border-radius: 15px;
                    padding: 25px;
                    border: 1px solid #333;
                    transition: transform 0.2s, border-color 0.2s;
                }
                
                .stat-card:hover {
                    transform: translateY(-2px);
                    border-color: #667eea;
                }
                
                .stat-title {
                    color: #888;
                    font-size: 14px;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    margin-bottom: 10px;
                }
                
                .stat-number {
                    font-size: 42px;
                    font-weight: 700;
                    color: #fff;
                    margin-bottom: 5px;
                }
                
                .stat-sub {
                    color: #4CAF50;
                    font-size: 13px;
                }
                
                /* Tables */
                .table-container {
                    background: #1a1a1a;
                    border-radius: 15px;
                    padding: 25px;
                    border: 1px solid #333;
                    margin-bottom: 30px;
                }
                
                .table-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                }
                
                .table-header h2 {
                    font-size: 20px;
                    color: #fff;
                }
                
                .table-header h2 i {
                    margin-right: 10px;
                    color: #667eea;
                }
                
                table {
                    width: 100%;
                    border-collapse: collapse;
                }
                
                th {
                    text-align: left;
                    padding: 15px 10px;
                    color: #888;
                    font-weight: 600;
                    font-size: 13px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    border-bottom: 2px solid #333;
                }
                
                td {
                    padding: 15px 10px;
                    border-bottom: 1px solid #2d2d2d;
                    font-size: 14px;
                }
                
                tr:hover td {
                    background: #252525;
                }
                
                /* Badges */
                .status-badge {
                    padding: 4px 12px;
                    border-radius: 30px;
                    font-size: 12px;
                    font-weight: 600;
                    display: inline-block;
                }
                
                .status-bound {
                    background: rgba(16, 185, 129, 0.2);
                    color: #10b981;
                    border: 1px solid #10b981;
                }
                
                .status-available {
                    background: rgba(245, 158, 11, 0.2);
                    color: #f59e0b;
                    border: 1px solid #f59e0b;
                }
                
                .status-expired {
                    background: rgba(239, 68, 68, 0.2);
                    color: #ef4444;
                    border: 1px solid #ef4444;
                }
                
                .method-hwid {
                    background: rgba(102, 126, 234, 0.2);
                    color: #667eea;
                    padding: 2px 8px;
                    border-radius: 12px;
                    font-size: 11px;
                    font-weight: 600;
                }
                
                .method-fp {
                    background: rgba(245, 158, 11, 0.2);
                    color: #f59e0b;
                    padding: 2px 8px;
                    border-radius: 12px;
                    font-size: 11px;
                    font-weight: 600;
                }
                
                .device-id {
                    font-family: 'Monaco', 'Menlo', monospace;
                    font-size: 12px;
                    color: #888;
                }
                
                /* Activity Log */
                .log-container {
                    background: #1a1a1a;
                    border-radius: 15px;
                    padding: 25px;
                    border: 1px solid #333;
                }
                
                .log-entry {
                    display: flex;
                    align-items: center;
                    gap: 20px;
                    padding: 12px;
                    border-bottom: 1px solid #2d2d2d;
                    font-size: 13px;
                }
                
                .log-time {
                    color: #888;
                    min-width: 180px;
                }
                
                .log-key {
                    font-weight: 600;
                    color: #667eea;
                    min-width: 120px;
                }
                
                .log-status {
                    padding: 2px 10px;
                    border-radius: 12px;
                    font-size: 11px;
                    font-weight: 600;
                }
                
                .status-success {
                    background: rgba(16, 185, 129, 0.2);
                    color: #10b981;
                }
                
                .status-failed {
                    background: rgba(239, 68, 68, 0.2);
                    color: #ef4444;
                }
                
                .status-warning {
                    background: rgba(245, 158, 11, 0.2);
                    color: #f59e0b;
                }
                
                /* Action Buttons */
                .actions {
                    display: flex;
                    gap: 10px;
                }
                
                .btn {
                    padding: 8px 16px;
                    border-radius: 8px;
                    border: none;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                
                .btn-refresh {
                    background: #2d2d2d;
                    color: #fff;
                    border: 1px solid #444;
                }
                
                .btn-refresh:hover {
                    background: #3d3d3d;
                }
                
                .footer {
                    text-align: center;
                    margin-top: 30px;
                    color: #666;
                    font-size: 12px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <!-- Header -->
                <div class="header">
                    <div>
                        <h1>🔐 HWID License System - Staff Panel</h1>
                        <div style="margin-top: 8px; color: #888; font-size: 14px;">
                            <i>Manage your license keys and monitor activity</i>
                        </div>
                    </div>
                    <div class="badge">
                        <i>●</i> Last Updated: ${new Date().toLocaleString()}
                    </div>
                </div>
                
                <!-- Stats Overview -->
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-title">Total Licenses</div>
                        <div class="stat-number">${Object.keys(whitelist).length}</div>
                        <div class="stat-sub">${totalBound} bound devices</div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-title">PC Users (HWID)</div>
                        <div class="stat-number">${totalPC}</div>
                        <div class="stat-sub">${((totalPC/totalBound) || 0).toFixed(1)}% of bound</div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-title">Mobile Users</div>
                        <div class="stat-number">${totalMobile}</div>
                        <div class="stat-sub">${((totalMobile/totalBound) || 0).toFixed(1)}% of bound</div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-title">Total Validations</div>
                        <div class="stat-number">${usageLog.length}</div>
                        <div class="stat-sub">${expiredKeys} expired keys</div>
                    </div>
                </div>
                
                <!-- License Keys Table -->
                <div class="table-container">
                    <div class="table-header">
                        <h2><i>📋</i> License Keys Management</h2>
                        <button class="btn btn-refresh" onclick="location.reload()">↻ Refresh</button>
                    </div>
                    
                    <table>
                        <thead>
                            <tr>
                                <th>License Key</th>
                                <th>Status</th>
                                <th>Method</th>
                                <th>Device ID</th>
                                <th>Note</th>
                                <th>Expires</th>
                            </tr>
                        </thead>
                        <tbody>
    `;
    
    // Add each license to table
    for (const [key, data] of Object.entries(whitelist)) {
        // Determine status
        let statusClass = 'status-available';
        let statusText = 'Available';
        
        if (data.expires && new Date(data.expires) < new Date()) {
            statusClass = 'status-expired';
            statusText = 'Expired';
        } else if (data.bindingMethod) {
            statusClass = 'status-bound';
            statusText = 'Bound';
        }
        
        // Determine method badge
        let methodBadge = '';
        if (data.bindingMethod === 'hwid') {
            methodBadge = '<span class="method-hwid">HWID</span>';
        } else if (data.bindingMethod === 'fingerprint') {
            methodBadge = '<span class="method-fp">Fingerprint</span>';
        } else {
            methodBadge = '<span style="color: #666;">—</span>';
        }
        
        // Device ID display
        let deviceDisplay = '—';
        if (data.bindingMethod === 'hwid' && data.hwid) {
            deviceDisplay = `<span class="device-id">${data.hwid.substring(0, 20)}...</span>`;
        } else if (data.bindingMethod === 'fingerprint' && data.fingerprint) {
            deviceDisplay = `<span class="device-id">${data.fingerprint.substring(0, 20)}...</span>`;
        }
        
        // Expiry display
        let expiryDisplay = data.expires || 'Never';
        if (data.expires && new Date(data.expires) < new Date()) {
            expiryDisplay = `<span style="color: #ef4444;">${data.expires} (Expired)</span>`;
        }
        
        html += `
            <tr>
                <td><strong style="color: #fff;">${key}</strong></td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>${methodBadge}</td>
                <td>${deviceDisplay}</td>
                <td style="color: #888;">${data.note}</td>
                <td>${expiryDisplay}</td>
            </tr>
        `;
    }
    
    html += `
                        </tbody>
                    </table>
                </div>
                
                <!-- Activity Log -->
                <div class="log-container">
                    <div class="table-header">
                        <h2><i>📊</i> Recent Activity Log</h2>
                        <span style="color: #888; font-size: 13px;">Last 20 events</span>
                    </div>
                    
                    <div style="max-height: 400px; overflow-y: auto;">
    `;
    
    if (usageLog.length === 0) {
        html += '<div style="text-align: center; padding: 40px; color: #666;">No activity yet</div>';
    } else {
        for (let i = Math.max(0, usageLog.length - 20); i < usageLog.length; i++) {
            const log = usageLog[i];
            let statusClass = 'status-warning';
            
            if (log.status.includes('VALID') || log.status.includes('BOUND')) {
                statusClass = 'status-success';
            } else if (log.status.includes('INVALID') || log.status.includes('BLACKLISTED')) {
                statusClass = 'status-failed';
            }
            
            html += `
                <div class="log-entry">
                    <span class="log-time">${new Date(log.time).toLocaleString()}</span>
                    <span class="log-key">${log.key}</span>
                    <span class="log-status ${statusClass}">${log.status}</span>
                </div>
            `;
        }
    }
    
    html += `
                    </div>
                </div>
                
                <!-- Footer -->
                <div class="footer">
                    <p>HWID Authentication System • Staff Access Only • ${new Date().toLocaleDateString()}</p>
                </div>
            </div>
        </body>
        </html>
    `;
    
    res.send(html);
});

// Reset endpoint (for when users get new devices)
app.post('/reset', (req, res) => {
    const { adminKey, licenseKey } = req.body;
    
    if (adminKey !== "madmoney072") {
        return res.json({ success: false, message: "Unauthorized" });
    }
    
    if (whitelist[licenseKey]) {
        whitelist[licenseKey].hwid = null;
        whitelist[licenseKey].fingerprint = null;
        whitelist[licenseKey].bindingMethod = null;
        
        res.json({ success: true, message: "License reset successfully" });
    } else {
        res.json({ success: false, message: "License not found" });
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ HWID Server running on port ${PORT}`);
    console.log(`📝 Validation endpoint: http://localhost:${PORT}/validate`);
    console.log(`👀 Admin panel: http://localhost:${PORT}/admin?password=madmoney072`);
    console.log(`📊 Active licenses: ${Object.keys(whitelist).length}`);
});
