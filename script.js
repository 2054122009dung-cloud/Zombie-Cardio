    // --- State & Classes ---
    let player = {
        hp: 100, maxHp: 100, dmg: 10, scrap: 0,
        headshotMult: 3.0, startDistance: 20, turretLevel: 0,
        weapon: 'ranged' // Added weapon state
    };

    const ZOMBIE_CLASSES = [
        { name: "Walker", head: "🧟", body: "🦺", legs: "👖", hpMult: 1, speed: 1.0, dmgMult: 1, behavior: 'normal' },
        { name: "Sprinter", head: "🧛", body: "👕", legs: "🩳", hpMult: 0.6, speed: 2.5, dmgMult: 0.8, behavior: 'dodge' },
        { name: "Tank", head: "👹", body: "🧥", legs: "👖", hpMult: 3.5, speed: 0.5, dmgMult: 2, behavior: 'tank' },
        { name: "Spitter", head: "👽", body: "🥼", legs: "👖", hpMult: 0.9, speed: 0.7, dmgMult: 1.5, behavior: 'ranged' }
    ];

    let activeZombies = [];
    let currentWave = 1;
    let waveInProgress = false;
    let isDead = false;

    let costs = { dmg: 15, hp: 20, heal: 5, scope: 40, trap: 50, grenade: 15, turret: 60 };
    let gameLoopTimer = null;
    let turretTimer = null;

    // --- DOM Elements ---
    const elPlayerHpFill = document.getElementById('player-hp-fill');
    const elPlayerHpTxt = document.getElementById('player-hp-txt');
    const elPlayerDmgTxt = document.getElementById('player-dmg-txt');
    const elPlayerCritTxt = document.getElementById('player-crit-txt');
    const elLootDisplay = document.getElementById('loot-display');
    const elWeaponDisplay = document.getElementById('weapon-display');
    
    const elZombiesLayer = document.getElementById('zombies-layer');
    const elWaveTxt = document.getElementById('wave-txt');
    const elZombiesLeftTxt = document.getElementById('zombies-left-txt');

    const shopBtns = {
        dmg: document.getElementById('btn-upg-dmg'), hp: document.getElementById('btn-upg-hp'),
        heal: document.getElementById('btn-heal'), scope: document.getElementById('btn-upg-scope'),
        trap: document.getElementById('btn-upg-trap'), grenade: document.getElementById('btn-grenade'),
        turret: document.getElementById('btn-upg-turret')
    };
    const costTxts = {
        dmg: document.getElementById('cost-dmg'), hp: document.getElementById('cost-hp'),
        heal: document.getElementById('cost-heal'), scope: document.getElementById('cost-scope'),
        trap: document.getElementById('cost-trap'), grenade: document.getElementById('cost-grenade'),
        turret: document.getElementById('cost-turret')
    };

    // --- Core Loops ---
    function init() {
        startWave(1);
        startGameLoop();
        updateUI();
    }

    // Weapon Swap Logic
    function swapWeapon() {
        player.weapon = player.weapon === 'ranged' ? 'melee' : 'ranged';
        elWeaponDisplay.innerText = `Wep: ${player.weapon.toUpperCase()}`;
        createFloatingText(window.innerWidth / 2, window.innerHeight / 2, `EQUIPPED: ${player.weapon.toUpperCase()}`, "#fff");
    }

    function startGameLoop() {
        if(gameLoopTimer) clearInterval(gameLoopTimer);
        gameLoopTimer = setInterval(() => {
            if (isDead || !waveInProgress) return;
            updatePhysics();
        }, 50); // 20 ticks per second

        // Turret Logic (BUFFED)
        if(turretTimer) clearInterval(turretTimer);
        turretTimer = setInterval(() => {
            if(isDead || !waveInProgress || player.turretLevel === 0) return;
            fireTurret();
        }, 600); // Turret fires every 0.6s now
    }

    function startWave(waveNum) {
        currentWave = waveNum;
        waveInProgress = true;
        elWaveTxt.innerText = waveNum;
        
        let hordeSize = 3 + Math.floor(waveNum * 1.5); // Slow meta progression
        activeZombies = [];
        elZombiesLayer.innerHTML = ''; 

        for(let i=0; i < hordeSize; i++) {
            let distanceOffset = Math.random() * 5; 
            spawnSingleZombie(i, player.startDistance + distanceOffset);
        }
        updateUI();
    }

    function spawnSingleZombie(id, startDist) {
        let type;
        if (currentWave === 1) {
            type = ZOMBIE_CLASSES[0];
        } else {
            let roll = Math.random();
            if(roll < 0.5) type = ZOMBIE_CLASSES[0]; 
            else if(roll < 0.75) type = ZOMBIE_CLASSES[1]; 
            else if(roll < 0.9) type = ZOMBIE_CLASSES[2]; 
            else type = ZOMBIE_CLASSES[3]; 
        }

        let baseWaveHp = 30 * Math.pow(1.2, currentWave - 1);
        let maxHp = Math.floor(baseWaveHp * type.hpMult);
        let baseWaveDmg = 5 * Math.pow(1.15, currentWave - 1);
        let dmg = Math.floor(baseWaveDmg * type.dmgMult);

        let zombie = {
            id: id, type: type,
            hp: maxHp, maxHp: maxHp, dmg: dmg,
            distance: startDist, speed: type.speed,
            attackCooldown: 1.0 + Math.random(), timeAlive: Math.random() * 10,
            isLunging: false, lungeTimer: 0, lungeCooldown: 2.0 + Math.random() * 2,
            baseLeft: 30 + Math.random() * 40, 
            isDead: false, element: null
        };

        let div = document.createElement('div');
        div.className = 'zombie-wrapper';
        div.id = 'zombie-' + id;
        div.innerHTML = `
            <div class="hitbox z-head" onmousedown="hitHead(event, ${id})">${type.head}</div>
            <div class="hitbox z-body" onmousedown="hitBody(event, ${id})">${type.body}</div>
            <div class="hitbox z-legs" onmousedown="hitLegs(event, ${id})">${type.legs}</div>
            <div class="zombie-hp-wrapper">
                <div class="hp-bar-container" style="height: 8px; border-width: 1px;">
                    <div class="hp-bar-fill" id="hp-fill-${id}"></div>
                </div>
            </div>
        `;
        elZombiesLayer.appendChild(div);
        zombie.element = div;
        
        activeZombies.push(zombie);
    }

    function updatePhysics() {
        let zombiesAlive = 0;

        activeZombies.forEach(z => {
            if (z.isDead) return;
            zombiesAlive++;
            z.timeAlive += 0.05;

            let attackRange = z.type.behavior === 'ranged' ? 8 : 1.5;
            let tickSpeed = z.speed * 0.04; 

            if (z.distance > attackRange) {
                if (z.isLunging) {
                    tickSpeed = z.speed * 0.15; 
                    z.lungeTimer -= 0.05;
                    if (z.lungeTimer <= 0) {
                        z.isLunging = false;
                        z.lungeCooldown = 2.0 + Math.random() * 3.0;
                    }
                } else {
                    z.lungeCooldown -= 0.05;
                    if (z.lungeCooldown <= 0 && z.distance < 12) {
                        z.isLunging = true;
                        z.lungeTimer = 0.5; 
                    }
                }
                z.distance -= tickSpeed; 
            } else {
                z.isLunging = false;
                z.attackCooldown -= 0.05;
                if (z.attackCooldown <= 0) {
                    zombieAttack(z);
                    z.attackCooldown = 1.5;
                }
            }

            let distanceRatio = Math.max(0, z.distance / 20);
            let scale = 0.15 + Math.pow(1 - distanceRatio, 3) * 1.4; 
            let topPos = 40 + (1 - distanceRatio) * 60; 
            
            let leftOffset = z.baseLeft;
            let lungeSwayMult = z.isLunging ? 3 : 1;

            if (z.type.behavior === 'dodge') {
                leftOffset += Math.sin(z.timeAlive * 5) * (15 * distanceRatio) * lungeSwayMult;
            } else if (z.type.behavior === 'normal') {
                leftOffset += Math.sin(z.timeAlive * 2) * (5 * distanceRatio) * lungeSwayMult;
            }

            z.element.style.transform = `translate(-50%, -100%) scale(${scale})`;
            z.element.style.top = `${topPos}%`;
            z.element.style.left = `${leftOffset}%`;
            z.element.style.zIndex = Math.floor(100 - z.distance);

            const head = z.element.querySelector('.z-head');
            head.style.transform = `rotate(${Math.sin(z.timeAlive * (z.isLunging ? 15 : 4)) * 10}deg)`;
        });

        elZombiesLeftTxt.innerText = zombiesAlive;

        if (zombiesAlive === 0 && waveInProgress) {
            endWave();
        }
    }

    // --- Combat System ---

    function createHitSpark(e) {
        if (e.target.id === 'arena' || e.target.id === 'zombies-layer') {
            createFloatingText(e.clientX, e.clientY, "Miss", "#555");
        }
    }

    function hitHead(e, id) { e.stopPropagation(); processHit(id, player.dmg * player.headshotMult, true, e.clientX, e.clientY); }
    function hitBody(e, id) { e.stopPropagation(); processHit(id, player.dmg * 0.3, false, e.clientX, e.clientY); }
    function hitLegs(e, id) { 
        e.stopPropagation(); 
        let z = activeZombies.find(z => z.id === id);
        if(z && z.speed > 0.2 && player.weapon !== 'melee') { // Only slow if ranged to balance melee
            z.speed *= 0.7; 
            createFloatingText(e.clientX, e.clientY - 30, "SLOWED!", "#00ffff");
        }
        if(z) { z.isLunging = false; z.lungeCooldown = 2.0; } 
        processHit(id, player.dmg * 0.15, false, e.clientX, e.clientY); 
    }

    function processHit(id, amount, isHeadshot, x, y) {
        if (isDead || !waveInProgress) return;
        let z = activeZombies.find(z => z.id === id);
        if (!z || z.isDead) return;

        // Weapon check logic
        if (player.weapon === 'melee') {
            if (z.distance > 8) { // Target is too far for melee
                createFloatingText(x, y, "TOO FAR!", "#ffcc00");
                return;
            }
            amount *= 3; // Melee is highly lethal when close
        }

        z.element.classList.remove('damage-flash');
        void z.element.offsetWidth;
        z.element.classList.add('damage-flash');

        z.hp -= amount;
        
        let color = isHeadshot ? "var(--blood-red)" : "#aaa";
        let txt = isHeadshot ? `CRIT -${Math.floor(amount)}` : `-${Math.floor(amount)}`;
        if(player.weapon === 'melee') txt = `SLAM -${Math.floor(amount)}`;
        
        createFloatingText(x, y, txt, color);

        const fill = document.getElementById(`hp-fill-${id}`);
        if(fill) fill.style.width = `${Math.max(0, (z.hp / z.maxHp) * 100)}%`;

        if (z.hp <= 0) killZombie(z);
        updateUI();
    }

    function killZombie(z) {
        z.isDead = true;
        z.element.style.display = 'none'; 
        
        let baseLoot = 5 * Math.pow(1.15, currentWave);
        let distBonus = z.distance > 15 ? 5 : (z.distance > 8 ? 2 : 0);
        player.scrap += Math.floor(baseLoot + distBonus);
    }

    function zombieAttack(z) {
        player.hp -= z.dmg;
        
        const container = document.getElementById('game-container');
        container.classList.remove('shake');
        void container.offsetWidth;
        container.classList.add('shake');
        
        const arena = document.getElementById('arena');
        arena.style.boxShadow = "inset 0 0 100px rgba(255,0,0,0.8)";
        setTimeout(() => arena.style.boxShadow = "", 200);

        createFloatingText(window.innerWidth / 2, window.innerHeight / 3, "HIT!", "var(--blood-red)");
        
        if (player.hp <= 0) die();
        updateUI();
    }

    // --- Skills & Weapons ---

    function useGrenade() {
        if (player.scrap >= costs.grenade && waveInProgress) {
            player.scrap -= costs.grenade;
            
            const arena = document.getElementById('arena');
            arena.style.boxShadow = "inset 0 0 150px rgba(255, 152, 0, 0.8)";
            setTimeout(() => arena.style.boxShadow = "", 300);
            createFloatingText(window.innerWidth / 2, window.innerHeight / 2, "BOOM!", "#ff9800");

            // NERFED Grenade: Less base damage, slightly lower scaling
            let aoeDmg = 25 + (player.dmg * 1.2); 
            activeZombies.forEach(z => {
                if(!z.isDead) {
                    let rect = z.element.getBoundingClientRect();
                    // Process hit directly to avoid melee distance checks on AoE
                    z.hp -= aoeDmg;
                    createFloatingText(rect.left + 50, rect.top + 50, `-${Math.floor(aoeDmg)}`, "#ff9800");
                    const fill = document.getElementById(`hp-fill-${z.id}`);
                    if(fill) fill.style.width = `${Math.max(0, (z.hp / z.maxHp) * 100)}%`;
                    if (z.hp <= 0) killZombie(z);
                }
            });
            // NERFED Grenade: Cost scales faster to prevent spam
            costs.grenade = Math.floor(costs.grenade * 1.5); 
            updateUI();
        }
    }

    function fireTurret() {
        let target = activeZombies.filter(z => !z.isDead).sort((a,b) => a.distance - b.distance)[0];
        if(target) {
            let rect = target.element.getBoundingClientRect();
            // BUFFED Turret: More base damage
            let turretDmg = 15 * player.turretLevel; 
            
            // Bypass melee range check by adjusting health directly like grenade, or simulate a normal attack
            target.hp -= turretDmg;
            createFloatingText(rect.left + 20, rect.top + 20, "Pew!", "#ffcc00");
            
            const fill = document.getElementById(`hp-fill-${target.id}`);
            if(fill) fill.style.width = `${Math.max(0, (target.hp / target.maxHp) * 100)}%`;
            if (target.hp <= 0) killZombie(target);
        }
    }

    function buyUpgrade(type) {
        if (player.scrap >= costs[type]) {
            player.scrap -= costs[type];
            if (type === 'dmg') {
                player.dmg += Math.floor(3 + (player.dmg * 0.15));
                costs.dmg = Math.floor(costs.dmg * 1.5);
            } else if (type === 'hp') {
                let gain = Math.floor(20 + (player.maxHp * 0.1));
                player.maxHp += gain; player.hp += gain;
                costs.hp = Math.floor(costs.hp * 1.5);
            } else if (type === 'scope') {
                player.headshotMult += 0.5;
                costs.scope = Math.floor(costs.scope * 1.8);
            } else if (type === 'trap') {
                activeZombies.forEach(z => { 
                    if(!z.isDead) { z.speed *= 0.6; z.distance += 5; } 
                });
                costs.trap = Math.floor(costs.trap * 1.5);
            } else if (type === 'turret') {
                player.turretLevel++;
                costs.turret = Math.floor(costs.turret * 2.0);
            }
            updateUI();
        }
    }

    function healPlayer() {
        if (player.scrap >= costs.heal && player.hp < player.maxHp) {
            player.scrap -= costs.heal;
            player.hp = Math.min(player.maxHp, player.hp + (player.maxHp * 0.4)); 
            costs.heal = Math.floor(costs.heal * 1.2);
            updateUI();
        }
    }

    // --- Game Flow Transitions ---

    function endWave() {
        waveInProgress = false;
        document.getElementById('wave-screen').style.display = 'flex';
        updateUI();
    }

    function startNextWave() {
        document.getElementById('wave-screen').style.display = 'none';
        startWave(currentWave + 1);
    }

    function die() {
        isDead = true;
        waveInProgress = false;
        player.hp = 0;
        document.getElementById('death-screen').style.display = 'flex';
        updateUI();
    }

    function respawn() {
        isDead = false;
        player.hp = player.maxHp;
        player.scrap = Math.floor(player.scrap * 0.8);
        document.getElementById('death-screen').style.display = 'none';
        startWave(currentWave); 
    }

    function updateUI() {
        elPlayerHpTxt.innerText = `${Math.floor(player.hp)} / ${player.maxHp} HP`;
        elPlayerHpFill.style.width = `${Math.max(0, (player.hp / player.maxHp) * 100)}%`;
        elPlayerDmgTxt.innerText = player.dmg;
        elPlayerCritTxt.innerText = player.headshotMult.toFixed(1);
        elLootDisplay.innerText = `Scrap: ${Math.floor(player.scrap)}`;

        shopBtns.dmg.disabled = player.scrap < costs.dmg;
        shopBtns.hp.disabled = player.scrap < costs.hp;
        shopBtns.scope.disabled = player.scrap < costs.scope;
        shopBtns.trap.disabled = player.scrap < costs.trap;
        shopBtns.grenade.disabled = player.scrap < costs.grenade || !waveInProgress;
        shopBtns.turret.disabled = player.scrap < costs.turret;
        shopBtns.heal.disabled = player.scrap < costs.heal || player.hp >= player.maxHp;

        costTxts.dmg.innerText = `${costs.dmg} Scrap`;
        costTxts.hp.innerText = `${costs.hp} Scrap`;
        costTxts.scope.innerText = `${costs.scope} Scrap`;
        costTxts.trap.innerText = `${costs.trap} Scrap`;
        costTxts.grenade.innerText = `${costs.grenade} Scrap`;
        
        if (player.turretLevel > 0) {
            document.querySelector('#btn-upg-turret .upg-title').innerText = `🤖 Upgrade Turret (Lv ${player.turretLevel})`;
        }
        costTxts.turret.innerText = `${costs.turret} Scrap`;
        costTxts.heal.innerText = `${costs.heal} Scrap`;
    }

    // --- Floating Text Render (FIXED/COMPLETED) ---
    function createFloatingText(x, y, text, color) {
        let el = document.createElement('div');
        el.className = 'hit-text';
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        el.style.color = color;
        el.innerText = text;
        document.body.appendChild(el);
        
        // Remove element after animation
        setTimeout(() => el.remove(), 800);
    }
