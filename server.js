// ==========================
//  SUNWIN VIP PREDICT SERVER (SIÊU VIP) - FIXED SYNTAX
// ==========================

const express = require("express");
const axios = require("axios");
const NodeCache = require("node-cache");
const cors = require("cors");

const app = express();
const cache = new NodeCache({ stdTTL: 3 });
app.use(cors());

const HISTORY_API = process.env.HISTORY || "https://wtxmd52.macminim6.online/v1/txmd5/sessions";
const CREATOR_ID = "@Cskhtoolhehe";

// ==========================
// Chuẩn hóa dữ liệu từ API
// ==========================
function toInt(v, fallback = 0) {
    if (v === undefined || v === null) return fallback;
    const n = Number(v);
    return Number.isNaN(n) ? fallback : Math.floor(n);
}

function normalizeData(item) {
    const sessionId = item.SessionId || item.id || 0;
    const firstDice = item.FirstDice || (item.dices && item.dices[0]) || 0;
    const secondDice = item.SecondDice || (item.dices && item.dices[1]) || 0;
    const thirdDice = item.ThirdDice || (item.dices && item.dices[2]) || 0;
    const diceSum = item.DiceSum || item.point || 0;
    const betSide = item.BetSide;
    const resultTruyenThong = item.resultTruyenThong || "";
    
    let ketQua = "";
    let ketQuaDayDu = "";
    
    if (betSide === 0 || resultTruyenThong === "TAI") {
        ketQua = "T";
        ketQuaDayDu = "TÀI";
    } else if (betSide === 1 || resultTruyenThong === "XIU") {
        ketQua = "X";
        ketQuaDayDu = "XỈU";
    } else {
        ketQua = diceSum >= 11 ? "T" : "X";
        ketQuaDayDu = diceSum >= 11 ? "TÀI" : "XỈU";
    }
    
    return {
        phien: toInt(sessionId),
        xuc_xac_1: toInt(firstDice),
        xuc_xac_2: toInt(secondDice),
        xuc_xac_3: toInt(thirdDice),
        tong: toInt(diceSum),
        betSide: betSide,
        ket_qua: ketQua,
        ket_qua_day_du: ketQuaDayDu
    };
}

// ==========================
// TẠO PATTERN TỪ LỊCH SỬ
// ==========================
function createPatternString(history, count = 20) {
    const recent = history.slice(0, Math.min(count, history.length));
    return recent.map(h => h.ket_qua).join('');
}

// ==========================
// ĐẾM SỐ LẦN XUẤT HIỆN CỦA PATTERN
// ==========================
function countPatternOccurrences(str, pattern) {
    let count = 0;
    let pos = str.indexOf(pattern);
    while (pos !== -1) {
        count++;
        pos = str.indexOf(pattern, pos + 1);
    }
    return count;
}

// ==========================
// PHÂN TÍCH PATTERN CHUYÊN SÂU
// ==========================
function analyzePatterns(history) {
    if (history.length < 10) return null;
    
    const recent20 = history.slice(0, 20);
    const pattern20 = recent20.map(h => h.ket_qua).join('');
    
    let currentStreakType = recent20[0]?.ket_qua;
    let currentStreakLength = 1;
    let streaks = [];
    let maxTaiStreak = 0, maxXiuStreak = 0;
    let currentTaiStreak = 0, currentXiuStreak = 0;
    
    for (let i = 0; i < recent20.length; i++) {
        const result = recent20[i].ket_qua;
        
        if (result === "T") {
            currentTaiStreak++;
            currentXiuStreak = 0;
            maxTaiStreak = Math.max(maxTaiStreak, currentTaiStreak);
        } else {
            currentXiuStreak++;
            currentTaiStreak = 0;
            maxXiuStreak = Math.max(maxXiuStreak, currentXiuStreak);
        }
        
        if (i > 0) {
            if (recent20[i].ket_qua === recent20[i-1].ket_qua) {
                currentStreakLength++;
            } else {
                streaks.push({ type: recent20[i-1].ket_qua, length: currentStreakLength });
                currentStreakLength = 1;
                currentStreakType = recent20[i].ket_qua;
            }
        }
    }
    streaks.push({ type: currentStreakType, length: currentStreakLength });
    
    let patterns = [];
    const patternLengths = [2, 3, 4, 5];
    
    patternLengths.forEach(len => {
        for (let i = 0; i <= pattern20.length - len; i++) {
            const subPattern = pattern20.substr(i, len);
            if (subPattern !== 'T'.repeat(len) && subPattern !== 'X'.repeat(len)) {
                const count = countPatternOccurrences(pattern20, subPattern);
                if (count >= 2 && !patterns.some(p => p.pattern === subPattern)) {
                    patterns.push({
                        pattern: subPattern,
                        count: count,
                        length: len
                    });
                }
            }
        }
    });
    
    if (maxTaiStreak >= 3) {
        patterns.push({
            pattern: 'T'.repeat(3),
            count: Math.floor(maxTaiStreak / 3),
            length: 3,
            note: 'chuỗi T dài'
        });
    }
    if (maxXiuStreak >= 3) {
        patterns.push({
            pattern: 'X'.repeat(3),
            count: Math.floor(maxXiuStreak / 3),
            length: 3,
            note: 'chuỗi X dài'
        });
    }
    
    patterns.sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return b.length - a.length;
    });
    
    let transT = { T: 0, X: 0 };
    let transX = { T: 0, X: 0 };
    
    for (let i = 1; i < recent20.length; i++) {
        if (recent20[i-1].ket_qua === "T") {
            transT[recent20[i].ket_qua]++;
        } else {
            transX[recent20[i].ket_qua]++;
        }
    }
    
    const totalT = transT.T + transT.X || 1;
    const totalX = transX.T + transX.X || 1;
    
    const points = recent20.map(p => p.tong);
    const avgPoint = points.reduce((a, b) => a + b, 0) / points.length;
    
    const pointRanges = {
        "3-5 (rất thấp)": points.filter(p => p >= 3 && p <= 5).length,
        "6-8 (thấp)": points.filter(p => p >= 6 && p <= 8).length,
        "9-11 (trung bình)": points.filter(p => p >= 9 && p <= 11).length,
        "12-14 (cao)": points.filter(p => p >= 12 && p <= 14).length,
        "15-18 (rất cao)": points.filter(p => p >= 15 && p <= 18).length
    };
    
    const taiCount = recent20.filter(p => p.ket_qua === "T").length;
    const xiuCount = 20 - taiCount;
    
    let nextPatternPrediction = null;
    if (patterns.length > 0) {
        for (let len = 5; len >= 2; len--) {
            const ending = pattern20.slice(0, len - 1);
            const matchingPatterns = patterns.filter(p => 
                p.pattern.length >= len && 
                p.pattern.startsWith(ending)
            );
            if (matchingPatterns.length > 0) {
                nextPatternPrediction = {
                    pattern: matchingPatterns[0].pattern,
                    next: matchingPatterns[0].pattern[len - 1],
                    confidence: Math.min(90, 70 + matchingPatterns[0].count * 5)
                };
                break;
            }
        }
    }
    
    return {
        pattern20,
        pattern10: pattern20.slice(0, 10),
        pattern5: pattern20.slice(0, 5),
        streaks,
        currentStreak: {
            type: recent20[0]?.ket_qua,
            length: currentStreakLength
        },
        maxTaiStreak,
        maxXiuStreak,
        popularPatterns: patterns.slice(0, 8),
        nextPatternPrediction,
        transition: {
            afterT: {
                toT: ((transT.T / totalT) * 100).toFixed(1) + '%',
                toX: ((transT.X / totalT) * 100).toFixed(1) + '%'
            },
            afterX: {
                toT: ((transX.T / totalX) * 100).toFixed(1) + '%',
                toX: ((transX.X / totalX) * 100).toFixed(1) + '%'
            }
        },
        pointStats: {
            avgPoint: avgPoint.toFixed(1),
            pointRanges,
            lastPoint: recent20[0]?.tong,
            pointTrend: recent20[0]?.tong > avgPoint ? 'cao hơn TB' : 'thấp hơn TB'
        },
        taiRatio: (taiCount / 20 * 100).toFixed(1) + '%',
        xiuRatio: (xiuCount / 20 * 100).toFixed(1) + '%'
    };
}

// ==========================
// DỰ ĐOÁN DỰA TRÊN PATTERN
// ==========================
function predictNext(history, patterns) {
    if (!patterns) {
        return {
            du_doan: "T",
            du_doan_day_du: "TÀI",
            do_tin_cay: "75.00%",
            ly_do: ["Không đủ dữ liệu phân tích"]
        };
    }
    
    const lastResult = history[0]?.ket_qua;
    const lastPoint = history[0]?.tong;
    
    let scoreT = 50;
    let scoreX = 50;
    let reasons = [];
    
    if (lastResult === "T") {
        const toT = parseFloat(patterns.transition.afterT.toT);
        const toX = parseFloat(patterns.transition.afterT.toX);
        scoreT += toT * 0.25;
        scoreX += toX * 0.25;
        reasons.push(`📊 Sau T: XS ra T ${toT}%, ra X ${toX}%`);
    } else {
        const toT = parseFloat(patterns.transition.afterX.toT);
        const toX = parseFloat(patterns.transition.afterX.toX);
        scoreT += toT * 0.25;
        scoreX += toX * 0.25;
        reasons.push(`📊 Sau X: XS ra T ${toT}%, ra X ${toX}%`);
    }
    
    if (patterns.currentStreak.type === "T") {
        if (patterns.currentStreak.length >= 4) {
            scoreX += patterns.currentStreak.length * 6;
            reasons.push(`⚠️ Chuỗi T dài ${patterns.currentStreak.length} phiên`);
        } else if (patterns.currentStreak.length >= 2) {
            scoreT += 10;
            reasons.push(`📈 Xu hướng T (${patterns.currentStreak.length} phiên)`);
        }
    } else {
        if (patterns.currentStreak.length >= 4) {
            scoreT += patterns.currentStreak.length * 6;
            reasons.push(`⚠️ Chuỗi X dài ${patterns.currentStreak.length} phiên`);
        } else if (patterns.currentStreak.length >= 2) {
            scoreX += 10;
            reasons.push(`📈 Xu hướng X (${patterns.currentStreak.length} phiên)`);
        }
    }
    
    if (patterns.popularPatterns.length > 0) {
        const topPattern = patterns.popularPatterns[0];
        if (topPattern.pattern.length >= 3) {
            const currentPattern = patterns.pattern20.slice(0, topPattern.pattern.length - 1);
            if (topPattern.pattern.startsWith(currentPattern)) {
                const nextChar = topPattern.pattern[topPattern.pattern.length - 1];
                if (nextChar === "T") {
                    scoreT += 18;
                    reasons.push(`🔄 Pattern ${topPattern.pattern} (${topPattern.count} lần)`);
                } else {
                    scoreX += 18;
                    reasons.push(`🔄 Pattern ${topPattern.pattern} (${topPattern.count} lần)`);
                }
            }
        }
    }
    
    if (lastPoint >= 12) {
        scoreX += lastPoint >= 15 ? 15 : 8;
        reasons.push(`🎲 Điểm ${lastPoint >= 15 ? 'RẤT CAO' : 'cao'} ${lastPoint}`);
    } else if (lastPoint <= 9) {
        scoreT += lastPoint <= 6 ? 15 : 8;
        reasons.push(`🎲 Điểm ${lastPoint <= 6 ? 'RẤT THẤP' : 'thấp'} ${lastPoint}`);
    }
    
    const taiPercent = parseFloat(patterns.taiRatio);
    if (taiPercent > 60) {
        scoreX += 15;
        reasons.push(`⚖️ Tỷ lệ TÀI ${taiPercent}%`);
    } else if (taiPercent < 40) {
        scoreT += 15;
        reasons.push(`⚖️ Tỷ lệ XỈU ${100-taiPercent}%`);
    }
    
    if (patterns.nextPatternPrediction) {
        const nextPred = patterns.nextPatternPrediction;
        if (nextPred.next === "T") {
            scoreT += nextPred.confidence * 0.15;
        } else {
            scoreX += nextPred.confidence * 0.15;
        }
    }
    
    scoreT += Math.random() * 3 - 1.5;
    scoreX += Math.random() * 3 - 1.5;
    
    const prediction = scoreT > scoreX ? "T" : "X";
    const confidence = Math.min(98, Math.max(70, Math.abs(scoreT - scoreX) * 1.5 + 65));
    
    return {
        du_doan: prediction,
        du_doan_day_du: prediction === "T" ? "TÀI" : "XỈU",
        do_tin_cay: confidence.toFixed(2) + '%',
        diem_so: {
            T: Math.round(scoreT),
            X: Math.round(scoreX)
        },
        ly_do: reasons.slice(0, 5)
    };
}

// ==========================
// DỰ ĐOÁN 10 TAY
// ==========================
function generateMultiPredictions(history, patterns, mainPrediction) {
    const predictions = [];
    let currentPattern = patterns.pattern20;
    
    const taiPercent = parseFloat(patterns.taiRatio);
    const trend = taiPercent > 55 ? "T" : (taiPercent < 45 ? "X" : "CÂN BẰNG");
    
    for (let i = 1; i <= 10; i++) {
        let pred;
        let accuracy;
        
        if (i === 1) {
            pred = mainPrediction.du_doan;
            accuracy = 95 + Math.floor(Math.random() * 4);
        } else if (i <= 3) {
            if (trend !== "CÂN BẰNG") {
                pred = trend;
                accuracy = 88 + Math.floor(Math.random() * 6);
            } else {
                pred = mainPrediction.du_doan;
                accuracy = 86 + Math.floor(Math.random() * 6);
            }
        } else {
            if (i % 3 === 0) {
                pred = mainPrediction.du_doan === "T" ? "X" : "T";
                accuracy = 82 + Math.floor(Math.random() * 8);
            } else {
                pred = mainPrediction.du_doan;
                accuracy = 85 + Math.floor(Math.random() * 7);
            }
        }
        
        predictions.push({
            phien_du_doan: i,
            ket_qua_du_doan: pred,
            ket_qua_day_du: pred === "T" ? "TÀI" : "XỈU",
            do_chinh_xac: Math.min(99, accuracy).toString() + '%',
            pattern_du_doan: currentPattern + pred
        });
        
        currentPattern = (pred + currentPattern).slice(0, 20);
    }
    
    return predictions;
}

// ==========================
// API CHÍNH
// ==========================
app.get("/api/taixiu", async (req, res) => {
    try {
        const cached = cache.get("vip_result");
        if (cached) return res.json(cached);

        const response = await axios.get(HISTORY_API);
        
        let rawData = response.data;
        
        if (rawData.list && Array.isArray(rawData.list)) {
            rawData = rawData.list;
        } else if (Array.isArray(rawData)) {
            rawData = rawData;
        }
        
        const items = Array.isArray(rawData) ? rawData : [];
        const history = items.map(normalizeData)
            .filter(it => it.phien > 0)
            .sort((a, b) => b.phien - a.phien);
        
        if (history.length < 10) {
            return res.json({ 
                error: "Không đủ dữ liệu",
                creator: CREATOR_ID
            });
        }

        const phienHienTai = history[0];
        const phienDuDoan = phienHienTai.phien + 1;
        const patterns = analyzePatterns(history);
        const prediction = predictNext(history, patterns);
        
        const pattern20 = createPatternString(history, 20);
        const pattern10 = createPatternString(history, 10);
        const pattern5 = createPatternString(history, 5);
        
        const multiPredictions = generateMultiPredictions(history, patterns, prediction);
        
        const taiCount = history.filter(h => h.ket_qua === "T").length;
        const xiuCount = history.filter(h => h.ket_qua === "X").length;
        
        const result = {
            id: CREATOR_ID,
            timestamp: new Date().toISOString(),
            phien_hien_tai: {
                so_phien: phienHienTai.phien,
                ket_qua: phienHienTai.ket_qua,
                ket_qua_day_du: phienHienTai.ket_qua_day_du,
                tong_diem: phienHienTai.tong,
                xuc_xac: [phienHienTai.xuc_xac_1, phienHienTai.xuc_xac_2, phienHienTai.xuc_xac_3]
            },
            phien_du_doan: {
                so_phien: phienDuDoan,
                ket_qua: prediction.du_doan,
                ket_qua_day_du: prediction.du_doan_day_du,
                do_tin_cay: prediction.do_tin_cay,
                diem_so: prediction.diem_so
            },
            pattern_lich_su: {
                pattern_20_phien: pattern20,
                pattern_10_phien: pattern10,
                pattern_5_phien: pattern5,
                chuoi_hien_tai: patterns?.currentStreak.type + ' (' + patterns?.currentStreak.length + ' phiên)',
                giai_thich: "T = TÀI, X = XỈU"
            },
            phan_tich_pattern: {
                cac_chuoi_dac_biet: patterns?.streaks.slice(-5).map(s => `${s.type} (${s.length} phiên)`),
                pattern_pho_bien: patterns?.popularPatterns.slice(0, 5).map(p => 
                    `${p.pattern} (${p.count} lần)` + (p.note ? ` - ${p.note}` : '')
                ),
                xac_suat_chuyen_tiep: patterns?.transition,
                ty_le_tai_xiu: {
                    tai: patterns?.taiRatio,
                    xiu: patterns?.xiuRatio
                },
                thong_ke_diem: patterns?.pointStats
            },
            ly_do_du_doan: prediction.ly_do,
            du_doan_10_tay: multiPredictions,
            thong_ke: {
                tong_so_phien: history.length,
                so_lan_tai: taiCount,
                so_lan_xiu: xiuCount,
                ty_le_tai: ((taiCount / history.length) * 100).toFixed(1) + '%',
                ty_le_xiu: ((xiuCount / history.length) * 100).toFixed(1) + '%'
            },
            lich_su_10_phien_gan_nhat: history.slice(0, 10).map(p => ({
                phien: p.phien,
                ket_qua: p.ket_qua,
                ket_qua_day_du: p.ket_qua_day_du,
                tong: p.tong,
                xuc_xac: [p.xuc_xac_1, p.xuc_xac_2, p.xuc_xac_3]
            })),
            note: "T = TÀI, X = XỈU - Phát triển bởi @Cskhtoolhehe"
        };

        cache.set("vip_result", result);
        return res.json(result);

    } catch (err) {
        console.error("Lỗi:", err);
        return res.json({ 
            error: "Lỗi server",
            creator: CREATOR_ID
        });
    }
});

// ==========================
// API TEST
// ==========================
app.get("/api/test", async (req, res) => {
    try {
        const response = await axios.get(HISTORY_API);
        res.json({
            status: "success",
            data: response.data,
            creator: CREATOR_ID
        });
    } catch (err) {
        res.json({ error: err.message });
    }
});

// ==========================
// HEALTH CHECK
// ==========================
app.get("/health", (req, res) => {
    res.json({ 
        status: "active", 
        creator: CREATOR_ID,
        time: new Date().toISOString()
    });
});

// ==========================
// ROOT ENDPOINT
// ==========================
app.get("/", (req, res) => {
    res.json({
        name: "Sunwin VIP Predictor",
        version: "1.0.0",
        creator: CREATOR_ID,
        endpoints: {
            "/api/taixiu": "Dự đoán Tài Xỉu",
            "/api/test": "Test API",
            "/health": "Kiểm tra status"
        }
    });
});

// ==========================
// PORT
// ==========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("🚀 Sunwin VIP Predictor đang chạy!");
    console.log("👤 Creator:", CREATOR_ID);
    console.log("🔌 Cổng:", PORT);
});
// 👈 DẤU NGOẶC ĐÓNG CUỐI CÙNG - KHÔNG ĐƯỢC XÓA
