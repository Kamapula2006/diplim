const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const os = require('os');
const bcrypt = require('bcryptjs');
const initSqlJs = require('sql.js');

const app = express();
const DB_FILE = path.join(__dirname, 'database.db');

app.set('trust proxy', 1);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'college-portal-secret-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000, secure: false, sameSite: 'lax' }
}));

let db;

function saveDb() {
    const data = db.export();
    fs.writeFileSync(DB_FILE, Buffer.from(data));
}

function query(sql, params=[]) {
    return db.exec(sql, params);
}

function run(sql, params=[]) {
    db.run(sql, params);
    saveDb();
}

function get(sql, params=[]) {
    const res = db.exec(sql, params);
    if (!res.length || !res[0].values.length) return null;
    const cols = res[0].columns;
    const row = res[0].values[0];
    const obj = {};
    cols.forEach((c,i) => obj[c] = row[i]);
    return obj;
}

function all(sql, params=[]) {
    const res = db.exec(sql, params);
    if (!res.length) return [];
    const cols = res[0].columns;
    return res[0].values.map(row => {
        const obj = {};
        cols.forEach((c,i) => obj[c] = row[i]);
        return obj;
    });
}

function runGet(sql, params=[]) {
    db.run(sql, params);
    const id = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
    saveDb();
    return id;
}

initSqlJs().then(SQL => {
    // Загружаем или создаём БД
    if (fs.existsSync(DB_FILE)) {
        const fileBuffer = fs.readFileSync(DB_FILE);
        db = new SQL.Database(fileBuffer);
        console.log('📂 База данных загружена из файла');
    } else {
        db = new SQL.Database();
        console.log('🆕 Создана новая база данных');
    }

    // Создание таблиц
    db.run(`
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student',
    grp TEXT DEFAULT '',
    bio TEXT DEFAULT '',
    online INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    cat TEXT DEFAULT 'general',
    target TEXT DEFAULT '',
    author TEXT,
    author_id INTEGER,
    date TEXT,
    pinned INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    cat TEXT DEFAULT 'question',
    grp TEXT DEFAULT '',
    author TEXT,
    author_id INTEGER,
    date TEXT,
    status TEXT DEFAULT 'open',
    views INTEGER DEFAULT 0,
    pinned INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS forum_msgs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    author TEXT,
    author_id INTEGER,
    role TEXT,
    date TEXT,
    time TEXT,
    is_op INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user1_id INTEGER,
    user2_id INTEGER,
    last_msg TEXT DEFAULT '',
    last_time TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS direct_msgs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conv_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    author TEXT,
    author_id INTEGER,
    date TEXT,
    time TEXT
);
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT DEFAULT '',
    date TEXT,
    time TEXT DEFAULT '',
    place TEXT DEFAULT '',
    type TEXT DEFAULT 'other',
    author_id INTEGER
);
CREATE TABLE IF NOT EXISTS docs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    cat TEXT DEFAULT 'other',
    ftype TEXT DEFAULT 'pdf',
    access TEXT DEFAULT '',
    author TEXT,
    author_id INTEGER,
    date TEXT,
    downloads INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    icon TEXT DEFAULT '🔔',
    date TEXT,
    is_read INTEGER DEFAULT 0,
    page TEXT DEFAULT 'dashboard'
);
    `);
    saveDb();

    // Заполнение начальными данными
    const count = get('SELECT COUNT(*) as c FROM users');
    if (!count || count.c === 0) {
        const d = (offset) => {
            const dt = new Date();
            dt.setDate(dt.getDate() + offset);
            return dt.toISOString().split('T')[0];
        };

        const users = [
            ['admin','admin','Администратор Системы','admin','','Управление платформой',1],
            ['teacher1','pass','Петрова Мария Ивановна','teacher','','Преподаватель информатики',1],
            ['teacher2','pass','Сидоров Алексей Петрович','teacher','','Преподаватель математики',0],
            ['student1','pass','Иванов Иван Иванович','student','ПИ-21','Староста группы',1],
            ['student2','pass','Смирнова Анна Олеговна','student','ПИ-21','',0],
            ['student3','pass','Козлов Дмитрий Сергеевич','student','ЭК-21','',1],
            ['student4','pass','Новикова Елена Андреевна','student','ПИ-21','',0],
        ];
        users.forEach(u => {
            const hashed = bcrypt.hashSync(u[1], 10);
            db.run('INSERT INTO users (username,password,name,role,grp,bio,online) VALUES (?,?,?,?,?,?,?)', [u[0], hashed, u[2], u[3], u[4], u[5], u[6]]);
        });

        db.run(`INSERT INTO announcements (title,body,cat,target,author,author_id,date,pinned) VALUES
            ('⚠️ Изменение расписания экзаменов','Уважаемые студенты! Расписание сдвигается на ${d(14)}.','urgent','','Петрова Мария Ивановна',2,'${d(-5)}',1),
            ('Зачётная неделя — порядок проведения','С ${d(7)} по ${d(14)} проходит зачётная неделя.','exam','students','Администратор Системы',1,'${d(-3)}',1),
            ('День открытых дверей','${d(21)} в колледже пройдёт День открытых дверей.','event','','Администратор Системы',1,'${d(-10)}',0),
            ('Запуск обновлённой версии КолледжПортала','Мы обновили платформу: добавлены новые функции.','news','','Администратор Системы',1,'${d(-2)}',0)
        `);

        db.run(`INSERT INTO topics (title,cat,grp,author,author_id,date,status,views,pinned) VALUES
            ('Как правильно оформить отчёт по лабораторной?','question','ПИ-21','Иванов Иван Иванович',4,'${d(-13)}','open',34,0),
            ('Материалы к экзамену по математике','discussion','','Сидоров Алексей Петрович',3,'${d(-8)}','open',56,0),
            ('Домашнее задание по теме Алгоритмы','homework','ПИ-21','Петрова Мария Ивановна',2,'${d(-6)}','open',23,0),
            ('📢 Важно: правила поведения на форуме','announce','','Администратор Системы',1,'${d(-20)}','open',128,1)
        `);

        db.run(`INSERT INTO forum_msgs (topic_id,text,author,author_id,role,date,time,is_op) VALUES
            (1,'Обязательный шаблон есть в разделе Документы → Шаблоны.','Петрова Мария Ивановна',2,'teacher','${d(-12)}','09:15',0),
            (1,'Спасибо! А можно сдать в электронном виде?','Иванов Иван Иванович',4,'student','${d(-12)}','10:00',1),
            (1,'Можно в обоих форматах.','Петрова Мария Ивановна',2,'teacher','${d(-11)}','10:30',0),
            (4,'Правила форума: 1. Уважайте друг друга 2. Используйте понятные заголовки','Администратор Системы',1,'admin','${d(-20)}','09:00',1)
        `);

        db.run(`INSERT INTO conversations (user1_id,user2_id,last_msg,last_time) VALUES
            (2,4,'Жду ваш отчёт до пятницы','${d(-1)} 11:45'),
            (1,4,'Добро пожаловать на платформу!','${d(-5)} 09:00')
        `);

        db.run(`INSERT INTO direct_msgs (conv_id,text,author,author_id,date,time) VALUES
            (1,'Иван, напоминаю что отчёт по лабораторной нужно сдать.','Петрова Мария Ивановна',2,'${d(-3)}','11:40'),
            (1,'Мария Ивановна, понял! Работаю над ним.','Иванов Иван Иванович',4,'${d(-2)}','11:43'),
            (1,'Жду ваш отчёт до пятницы','Петрова Мария Ивановна',2,'${d(-1)}','11:45')
        `);

        db.run(`INSERT INTO events (title,body,date,time,place,type,author_id) VALUES
            ('Зачёт по информатике','Зачёт для групп ПИ-21 и ПИ-22.','${d(5)}','10:00','Каб. 205','exam',2),
            ('День открытых дверей','Ежегодное мероприятие для абитуриентов.','${d(18)}','11:00','Актовый зал','event',1),
            ('Конкурс студенческих проектов','Дедлайн подачи заявок.','${d(28)}','23:59','Онлайн','deadline',1),
            ('Собрание старостата','Плановое собрание старост.','${d(10)}','14:00','Каб. 101','meeting',1)
        `);

        db.run(`INSERT INTO docs (name,description,cat,ftype,access,author,author_id,date,downloads) VALUES
            ('Устав колледжа 2026','Основной нормативный документ','regulatory','pdf','','Администратор Системы',1,'${d(-30)}',67),
            ('Шаблон отчёта по лабораторной','Стандартная форма оформления','templates','doc','students','Петрова Мария Ивановна',2,'${d(-15)}',189),
            ('Расписание занятий','Расписание для всех групп','schedule','pdf','','Администратор Системы',1,'${d(-7)}',312),
            ('Методичка по программированию Python','Учебное пособие','educational','pdf','students','Петрова Мария Ивановна',2,'${d(-25)}',98)
        `);

        db.run(`INSERT INTO notifications (user_id,text,icon,date,is_read,page) VALUES
            (4,'Новое объявление: «Изменение расписания экзаменов»','📢','${d(-5)}',0,'announcements'),
            (4,'Петрова М.И. ответила на вашу тему','💬','${d(-11)}',0,'forum'),
            (4,'Новое событие: «Зачёт по информатике»','📅','${d(-10)}',0,'events')
        `);

        saveDb();
        console.log('✅ База данных заполнена начальными данными');
    }

    // AUTH
    function requireAuth(req, res, next) {
        if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
        next();
    }
    function getMe(req) { return get('SELECT * FROM users WHERE id=?', [req.session.userId]); }

    app.post('/api/login', (req, res) => {
        const { username, password } = req.body;
        const user = get('SELECT * FROM users WHERE username=?', [username]);
        if (!user || !bcrypt.compareSync(password, user.password)) return res.status(400).json({ error: 'Неверный логин или пароль' });
        run('UPDATE users SET online=1 WHERE id=?', [user.id]);
        req.session.userId = user.id;
        user.online = 1;
        delete user.password;
        res.json(user);
    });

    app.post('/api/register', (req, res) => {
        const { name, username, password, grp } = req.body;
        if (!name || !username || !password) return res.status(400).json({ error: 'Заполните все поля' });
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return res.status(400).json({ error: 'Логин: 3–20 символов, латинские буквы, цифры и "_"' });
        if (password.length < 6) return res.status(400).json({ error: 'Пароль должен содержать не менее 6 символов' });
        if (get('SELECT id FROM users WHERE username=?', [username])) return res.status(400).json({ error: 'Логин уже занят' });
        try {
            const hashed = bcrypt.hashSync(password, 10);
            // Самостоятельная регистрация доступна только для роли "студент".
            // Роли "преподаватель"/"администратор" назначаются администратором вручную.
            const id = runGet('INSERT INTO users (username,password,name,role,grp,bio,online) VALUES (?,?,?,?,?,?,?)', [username, hashed, name, 'student', grp||'', '', 1]);
            const user = get('SELECT * FROM users WHERE id=?', [id]);
            req.session.userId = user.id;
            delete user.password;
            res.json(user);
        } catch(e) { res.status(500).json({ error: e.message }); }
    });

    app.post('/api/logout', (req, res) => {
        if (req.session.userId) run('UPDATE users SET online=0 WHERE id=?', [req.session.userId]);
        req.session.destroy();
        res.json({ ok: true });
    });

    app.get('/api/me', (req, res) => {
        if (!req.session.userId) return res.json(null);
        const user = get('SELECT * FROM users WHERE id=?', [req.session.userId]);
        if (user) delete user.password;
        res.json(user || null);
    });

    // USERS
    app.get('/api/users', requireAuth, (req, res) => {
        const me = getMe(req);
        const users = all('SELECT id,username,name,role,grp,bio FROM users');
        // Упрощённый онлайн-статус: онлайн показывается только у текущего пользователя
        res.json(users.map(u => ({ ...u, online: u.id === me.id ? 1 : 0 })));
    });

    // Список участников с возможностью смены роли — доступен только администратору
    app.get('/api/admin/users', requireAuth, (req, res) => {
        const me = getMe(req);
        if (me.role !== 'admin') return res.status(403).json({ error: 'Нет прав' });
        res.json(all('SELECT id,username,name,role,grp,bio FROM users ORDER BY id'));
    });

    app.put('/api/admin/users/:id/role', requireAuth, (req, res) => {
        const me = getMe(req);
        if (me.role !== 'admin') return res.status(403).json({ error: 'Нет прав' });
        const { role } = req.body;
        if (!['student','teacher','admin'].includes(role)) return res.status(400).json({ error: 'Некорректная роль' });
        const target = get('SELECT * FROM users WHERE id=?', [req.params.id]);
        if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
        run('UPDATE users SET role=? WHERE id=?', [role, req.params.id]);
        res.json({ ok: true });
    });

    app.put('/api/profile', requireAuth, (req, res) => {
        const { name, bio, password } = req.body;
        if (!name) return res.status(400).json({ error: 'ФИО не может быть пустым' });
        const me = getMe(req);
        if (password) {
            if (password.length < 6) return res.status(400).json({ error: 'Пароль должен содержать не менее 6 символов' });
            const hashed = bcrypt.hashSync(password, 10);
            run('UPDATE users SET name=?,bio=?,password=? WHERE id=?', [name, bio||'', hashed, me.id]);
        } else {
            run('UPDATE users SET name=?,bio=? WHERE id=?', [name, bio||'', me.id]);
        }
        const updated = get('SELECT * FROM users WHERE id=?', [me.id]);
        delete updated.password;
        res.json(updated);
    });

    app.post('/api/reset-password', (req, res) => {
        const { username, newPassword } = req.body;
        if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Пароль должен содержать не менее 6 символов' });
        const user = get('SELECT id FROM users WHERE username=?', [username]);
        if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
        const hashed = bcrypt.hashSync(newPassword, 10);
        run('UPDATE users SET password=? WHERE id=?', [hashed, user.id]);
        res.json({ ok: true });
    });

    // ОБЪЯВЛЕНИЯ
    app.get('/api/announcements', requireAuth, (req, res) => {
        res.json(all('SELECT * FROM announcements ORDER BY pinned DESC, id DESC'));
    });

    app.post('/api/announcements', requireAuth, (req, res) => {
        const me = getMe(req);
        if (me.role === 'student') return res.status(403).json({ error: 'Нет прав' });
        const { title, body, cat, target, pinned } = req.body;
        const today = new Date().toISOString().split('T')[0];
        const id = runGet('INSERT INTO announcements (title,body,cat,target,author,author_id,date,pinned) VALUES (?,?,?,?,?,?,?,?)', [title, body, cat||'general', target||'', me.name, me.id, today, pinned?1:0]);
        const users = all('SELECT id FROM users WHERE id!=?', [me.id]);
        users.forEach(u => run('INSERT INTO notifications (user_id,text,icon,date,is_read,page) VALUES (?,?,?,?,?,?)', [u.id, `Новое объявление: «${title}»`, '📢', today, 0, 'announcements']));
        res.json(get('SELECT * FROM announcements WHERE id=?', [id]));
    });

    app.delete('/api/announcements/:id', requireAuth, (req, res) => {
        const me = getMe(req);
        const ann = get('SELECT * FROM announcements WHERE id=?', [req.params.id]);
        if (!ann) return res.status(404).json({ error: 'Не найдено' });
        if (me.role === 'student') return res.status(403).json({ error: 'Нет прав' });
        run('DELETE FROM announcements WHERE id=?', [req.params.id]);
        res.json({ ok: true });
    });

    // ФОРУМ
    app.get('/api/topics', requireAuth, (req, res) => {
        const topics = all('SELECT * FROM topics ORDER BY pinned DESC, id DESC');
        const counts = all('SELECT topic_id, COUNT(*) as cnt FROM forum_msgs GROUP BY topic_id');
        const countMap = {};
        counts.forEach(c => countMap[c.topic_id] = c.cnt);
        res.json(topics.map(t => ({ ...t, replies: countMap[t.id] || 0 })));
    });

    app.post('/api/topics', requireAuth, (req, res) => {
        const me = getMe(req);
        const { title, cat, grp } = req.body;
        const today = new Date().toISOString().split('T')[0];
        const id = runGet('INSERT INTO topics (title,cat,grp,author,author_id,date,status,views,pinned) VALUES (?,?,?,?,?,?,?,?,?)', [title, cat||'question', grp||'', me.name, me.id, today, 'open', 0, 0]);
        res.json(get('SELECT * FROM topics WHERE id=?', [id]));
    });

    app.get('/api/topics/:id/messages', requireAuth, (req, res) => {
        run('UPDATE topics SET views=views+1 WHERE id=?', [req.params.id]);
        const topic = get('SELECT * FROM topics WHERE id=?', [req.params.id]);
        const msgs = all('SELECT * FROM forum_msgs WHERE topic_id=? ORDER BY id', [req.params.id]);
        res.json({ topic, msgs });
    });

    app.post('/api/topics/:id/messages', requireAuth, (req, res) => {
        const me = getMe(req);
        const { text } = req.body;
        const now = new Date();
        const date = now.toISOString().split('T')[0];
        const time = now.toTimeString().slice(0,5);
        const id = runGet('INSERT INTO forum_msgs (topic_id,text,author,author_id,role,date,time,is_op) VALUES (?,?,?,?,?,?,?,?)', [req.params.id, text, me.name, me.id, me.role, date, time, 0]);
        const topic = get('SELECT * FROM topics WHERE id=?', [req.params.id]);
        if (topic && topic.author_id !== me.id) {
            run('INSERT INTO notifications (user_id,text,icon,date,is_read,page) VALUES (?,?,?,?,?,?)', [topic.author_id, `${me.name} ответил(а) на тему «${topic.title}»`, '💬', date, 0, 'forum']);
        }
        res.json(get('SELECT * FROM forum_msgs WHERE id=?', [id]));
    });

    // СООБЩЕНИЯ
    app.get('/api/conversations', requireAuth, (req, res) => {
        const me = getMe(req);
        const convs = all('SELECT * FROM conversations WHERE user1_id=? OR user2_id=? ORDER BY id DESC', [me.id, me.id]);
        const users = all('SELECT id,username,name,role,grp,online FROM users');
        const userMap = {};
        users.forEach(u => userMap[u.id] = u);
        res.json(convs.map(c => {
            const otherId = c.user1_id === me.id ? c.user2_id : c.user1_id;
            return { ...c, other: userMap[otherId] || null };
        }));
    });

    app.post('/api/conversations', requireAuth, (req, res) => {
        const me = getMe(req);
        const { userId } = req.body;
        let conv = get('SELECT * FROM conversations WHERE (user1_id=? AND user2_id=?) OR (user1_id=? AND user2_id=?)', [me.id, userId, userId, me.id]);
        if (!conv) {
            const id = runGet('INSERT INTO conversations (user1_id,user2_id,last_msg,last_time) VALUES (?,?,?,?)', [me.id, userId, '', '']);
            conv = get('SELECT * FROM conversations WHERE id=?', [id]);
        }
        res.json(conv);
    });

    app.get('/api/conversations/:id/messages', requireAuth, (req, res) => {
        res.json(all('SELECT * FROM direct_msgs WHERE conv_id=? ORDER BY id', [req.params.id]));
    });

    app.post('/api/conversations/:id/messages', requireAuth, (req, res) => {
        const me = getMe(req);
        const { text } = req.body;
        const now = new Date();
        const date = now.toISOString().split('T')[0];
        const time = now.toTimeString().slice(0,5);
        const id = runGet('INSERT INTO direct_msgs (conv_id,text,author,author_id,date,time) VALUES (?,?,?,?,?,?)', [req.params.id, text, me.name, me.id, date, time]);
        run('UPDATE conversations SET last_msg=?,last_time=? WHERE id=?', [text.substring(0,60), `${date} ${time}`, req.params.id]);
        res.json(get('SELECT * FROM direct_msgs WHERE id=?', [id]));
    });

    // СОБЫТИЯ
    app.get('/api/events', requireAuth, (req, res) => {
        res.json(all('SELECT * FROM events ORDER BY date'));
    });

    app.post('/api/events', requireAuth, (req, res) => {
        const me = getMe(req);
        if (me.role === 'student') return res.status(403).json({ error: 'Нет прав' });
        const { title, body, date, time, place, type } = req.body;
        const id = runGet('INSERT INTO events (title,body,date,time,place,type,author_id) VALUES (?,?,?,?,?,?,?)', [title, body||'', date, time||'', place||'', type||'other', me.id]);
        const today = new Date().toISOString().split('T')[0];
        all('SELECT id FROM users WHERE id!=?', [me.id]).forEach(u => run('INSERT INTO notifications (user_id,text,icon,date,is_read,page) VALUES (?,?,?,?,?,?)', [u.id, `Новое событие: «${title}»`, '📅', today, 0, 'events']));
        res.json(get('SELECT * FROM events WHERE id=?', [id]));
    });

    app.delete('/api/events/:id', requireAuth, (req, res) => {
        const me = getMe(req);
        if (me.role === 'student') return res.status(403).json({ error: 'Нет прав' });
        run('DELETE FROM events WHERE id=?', [req.params.id]);
        res.json({ ok: true });
    });

    // ДОКУМЕНТЫ
    app.get('/api/docs', requireAuth, (req, res) => {
        res.json(all('SELECT * FROM docs ORDER BY id DESC'));
    });

    app.post('/api/docs', requireAuth, (req, res) => {
        const me = getMe(req);
        if (me.role === 'student') return res.status(403).json({ error: 'Нет прав' });
        const { name, description, cat, ftype, access } = req.body;
        const today = new Date().toISOString().split('T')[0];
        const id = runGet('INSERT INTO docs (name,description,cat,ftype,access,author,author_id,date,downloads) VALUES (?,?,?,?,?,?,?,?,?)', [name, description||'', cat||'other', ftype||'pdf', access||'', me.name, me.id, today, 0]);
        res.json(get('SELECT * FROM docs WHERE id=?', [id]));
    });

    app.delete('/api/docs/:id', requireAuth, (req, res) => {
        const me = getMe(req);
        if (me.role === 'student') return res.status(403).json({ error: 'Нет прав' });
        run('DELETE FROM docs WHERE id=?', [req.params.id]);
        res.json({ ok: true });
    });

    // УВЕДОМЛЕНИЯ
    app.get('/api/notifications', requireAuth, (req, res) => {
        const me = getMe(req);
        res.json(all('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC', [me.id]));
    });

    app.post('/api/notifications/read-all', requireAuth, (req, res) => {
        run('UPDATE notifications SET is_read=1 WHERE user_id=?', [getMe(req).id]);
        res.json({ ok: true });
    });

    app.get('/api/notifications/unread-count', requireAuth, (req, res) => {
        const r = get('SELECT COUNT(*) as cnt FROM notifications WHERE user_id=? AND is_read=0', [getMe(req).id]);
        res.json({ count: r ? r.cnt : 0 });
    });

    // ПОИСК
    app.get('/api/search', requireAuth, (req, res) => {
        const q = (req.query.q || '').toLowerCase();
        if (q.length < 2) return res.json([]);
        const like = `%${q}%`;
        const results = [];
        all('SELECT * FROM announcements WHERE LOWER(title) LIKE ? OR LOWER(body) LIKE ?', [like, like])
            .forEach(a => results.push({ icon:'📢', type:'Объявление', title:a.title, sub:a.body.substring(0,60), page:'announcements' }));
        all('SELECT * FROM topics WHERE LOWER(title) LIKE ?', [like])
            .forEach(t => results.push({ icon:'💬', type:'Форум', title:t.title, sub:`${t.author} · ${t.date}`, page:'forum', id:t.id }));
        all('SELECT * FROM docs WHERE LOWER(name) LIKE ?', [like])
            .forEach(d => results.push({ icon:'📁', type:'Документ', title:d.name, sub:d.description, page:'docs' }));
        all('SELECT * FROM events WHERE LOWER(title) LIKE ?', [like])
            .forEach(e => results.push({ icon:'📅', type:'Событие', title:e.title, sub:`${e.date} · ${e.place}`, page:'events' }));
        res.json(results);
    });

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, '0.0.0.0', () => {
        const ifaces = os.networkInterfaces();
        const candidates = [];
        for (const name of Object.keys(ifaces)) {
            for (const iface of ifaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) candidates.push(iface.address);
            }
        }
        // Предпочитаем обычные домашние/офисные сети (192.168.x.x, 10.x.x.x),
        // избегаем VPN-адаптеров (Radmin 26.x.x.x, ZeroTier 172.x.x.x и т.п.)
        const lanIp = candidates.find(ip => ip.startsWith('192.168.')) ||
                       candidates.find(ip => ip.startsWith('10.')) ||
                       candidates[0] || null;

        console.log(`\n🎓 КолледжПортал запущен!`);
        console.log(`   На этом компьютере: http://localhost:${PORT}`);
        if (lanIp) console.log(`   С других устройств в той же сети: http://${lanIp}:${PORT}`);
        if (candidates.length > 1) {
            console.log(`   (другие найденные адреса: ${candidates.filter(ip=>ip!==lanIp).join(', ')})`);
        }
        console.log(`\n   Тестовые аккаунты:`);
        console.log(`   admin / admin     — Администратор`);
        console.log(`   teacher1 / pass   — Преподаватель`);
        console.log(`   student1 / pass   — Студент\n`);
    });

}).catch(e => { console.error('Ошибка запуска:', e); });
