/* BEC单词学习 - 主应用
   ============================================ */
const App = {
  state: {
    currentView: 'learn',
    selectedTopic: null,
    learnWords: [],
    learnIndex: 0,
    showAnswer: false,
    quizMode: 'en2cn',
    quizWords: [],
    quizIndex: 0,
    quizAnswered: false,
    quizCorrect: 0,
    quizTotal: 0,
    isQuizResult: false,
    settingsOpen: false
  },

  /* ---- 初始化 ---- */
  async init() {
    this.bindNavEvents();
    this.bindSettingsEvents();
    await this.navigate('learn');
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js');
    }
  },

  /* ---- 导航 ---- */
  bindNavEvents() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', async () => {
        await this.navigate(item.dataset.view);
      });
    });
  },

  async navigate(view) {
    this.state.currentView = view;
    document.querySelectorAll('.nav-item').forEach(n => {
      n.classList.toggle('active', n.dataset.view === view);
    });
    if (view !== 'learn') {
      this.state.learnIndex = 0;
      this.state.showAnswer = false;
    }
    await this.render(view);
  },

  async render(view) {
    const container = document.getElementById('mainContent');
    container.innerHTML = '<div class="page">加载中...</div>';
    try {
      switch (view) {
        case 'learn': await this.renderLearn(container); break;
        case 'quiz': await this.renderQuiz(container); break;
        case 'review': await this.renderReview(container); break;
        case 'stats': await this.renderStats(container); break;
      }
    } catch (e) {
      console.error(e);
      container.innerHTML = '<div class="page empty-state"><p>加载出错了，请重试</p></div>';
    }
  },

  /* ============================================
     学习视图 (Flashcards)
     ============================================ */
  async renderLearn(container) {
    const topic = this.state.selectedTopic;
    const allWords = topic ? WORDS.filter(w => w.topic === topic) : WORDS;
    const due = await SRS.getDueWords(topic);
    const words = due.length > 0 ? due : allWords;

    this.state.learnWords = words;
    if (this.state.learnIndex >= words.length) {
      this.state.learnIndex = 0;
    }

    container.innerHTML = this.learnHTML(words, topic);
    this.bindLearnEvents();
  },

  learnHTML(words, activeTopic) {
    const total = words.length;
    const idx = this.state.learnIndex;
    const word = words[idx];
    const show = this.state.showAnswer;

    const topicItems = TOPICS.map(t =>
      `<button class="topic-dropdown-item ${t === activeTopic ? 'active' : ''}" data-topic="${t}">${t}</button>`
    ).join('');
    const allItem = `<button class="topic-dropdown-item ${!activeTopic ? 'active' : ''}" data-topic="">全部主题</button>`;

    const cardContent = total === 0
      ? `<div class="flashcard-empty"><div class="icon">✅</div><h3>全部学完啦!</h3><p>所有单词已掌握，换个主题继续吧</p></div>`
      : `<div class="flashcard-container">
          <div class="flashcard" id="flashcard">
            <div class="flashcard-word">${word.word}</div>
            <div class="flashcard-phonetic">${word.phonetic}</div>
            <button class="audio-btn" id="playAudioBtn">🔊</button>
            <div class="flashcard-divider"></div>
            <div class="${show ? '' : 'flashcard-hidden'}">
              <div class="flashcard-meaning">${word.meaning}</div>
              <div class="flashcard-example">"${word.example}"</div>
              <div class="flashcard-example-cn">${word.exampleCn}</div>
            </div>
            ${!show ? '<div class="flashcard-hint">👆 点击卡片显示释义</div>' : ''}
          </div>
          ${show ? `<div class="flashcard-actions">
            <button class="btn btn-danger btn-lg" id="forgetBtn">😅 不认识</button>
            <button class="btn btn-success btn-lg" id="knowBtn">✅ 认识</button>
          </div>` : ''}
          <div class="flashcard-progress">
            <div class="progress-bar">
              <div class="progress-fill" style="width:${total > 0 ? ((idx + 1) / total * 100) : 0}%"></div>
            </div>
          </div>
        </div>`;

    return `<div class="page">
      <div class="learn-header">
        <span class="learn-progress-text">${total > 0 ? `${idx + 1} / ${total}` : '0 / 0'}</span>
        <div class="topic-selector">
          <button class="topic-select-btn" id="topicSelectBtn">
            📂 ${activeTopic || '全部主题'} <span style="font-size:10px">▼</span>
          </button>
          <div class="topic-dropdown" id="topicDropdown">${topicItems}${allItem}</div>
        </div>
      </div>
      ${cardContent}
    </div>`;
  },

  bindLearnEvents() {
    const main = () => document.getElementById('mainContent');

    const card = document.getElementById('flashcard');
    if (card) {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.audio-btn')) return;
        if (!this.state.showAnswer) {
          this.state.showAnswer = true;
          this.renderLearn(main());
          this.speak(this.state.learnWords[this.state.learnIndex]?.word);
        }
      });
    }

    document.getElementById('playAudioBtn')?.addEventListener('click', () => {
      this.speak(this.state.learnWords[this.state.learnIndex]?.word);
    });

    document.getElementById('forgetBtn')?.addEventListener('click', async () => {
      const word = this.state.learnWords[this.state.learnIndex];
      if (!word) return;
      await SRS.review(word.id, false);
      const today = await DB.getTodayStats();
      if (this.state.learnIndex === 0) today.learned += 1;
      await DB.updateTodayStats({ learned: today.learned });
      this.nextCard();
    });

    document.getElementById('knowBtn')?.addEventListener('click', async () => {
      const word = this.state.learnWords[this.state.learnIndex];
      if (!word) return;
      await SRS.review(word.id, true);
      const today = await DB.getTodayStats();
      if (this.state.learnIndex === 0) today.learned += 1;
      await DB.updateTodayStats({ learned: today.learned });
      this.nextCard();
    });

    const topicBtn = document.getElementById('topicSelectBtn');
    const dropdown = document.getElementById('topicDropdown');
    if (topicBtn && dropdown) {
      topicBtn.addEventListener('click', () => dropdown.classList.toggle('open'));
      document.addEventListener('click', (e) => {
        if (dropdown && !e.target.closest('.topic-selector')) dropdown.classList.remove('open');
      });
      dropdown.querySelectorAll('.topic-dropdown-item').forEach(item => {
        item.addEventListener('click', async () => {
          this.state.selectedTopic = item.dataset.topic || null;
          this.state.learnIndex = 0;
          this.state.showAnswer = false;
          dropdown.classList.remove('open');
          await this.renderLearn(main());
        });
      });
    }
  },

  nextCard() {
    if (this.state.learnIndex < this.state.learnWords.length - 1) {
      this.state.learnIndex++;
      this.state.showAnswer = false;
    } else {
      this.state.showAnswer = false;
      this.showToast('🎉 本轮学习完成!');
    }
    this.renderLearn(document.getElementById('mainContent'));
  },

  /* ---- 语音 (Web Speech API) ---- */
  speak(text) {
    if (!text || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'en-US';
    utter.rate = 0.9;
    const voices = window.speechSynthesis.getVoices();
    const enVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) ||
                     voices.find(v => v.lang.startsWith('en-US')) ||
                     voices.find(v => v.lang.startsWith('en'));
    if (enVoice) utter.voice = enVoice;
    window.speechSynthesis.speak(utter);
  },

  /* ============================================
     练习视图
     ============================================ */
  async renderQuiz(container) {
    if (this.state.isQuizResult) {
      container.innerHTML = this.quizResultHTML();
      this.bindQuizResultEvents();
      return;
    }

    // 初始化/重置练习列表
    if (this.state.quizWords.length === 0 || this.state.quizIndex >= this.state.quizWords.length) {
      const shuffled = [...WORDS].sort(() => Math.random() - 0.5).slice(0, 10);
      this.state.quizWords = shuffled;
      this.state.quizIndex = 0;
      this.state.quizCorrect = 0;
      this.state.quizTotal = shuffled.length;
    }

    const word = this.state.quizWords[this.state.quizIndex];
    if (!word) {
      this.state.isQuizResult = true;
      container.innerHTML = this.quizResultHTML();
      this.bindQuizResultEvents();
      return;
    }

    container.innerHTML = this.quizHTML(word);
    this.bindQuizEvents(word);
  },

  quizHTML(word) {
    const idx = this.state.quizIndex + 1;
    const total = this.state.quizTotal;
    const mode = this.state.quizMode;

    // 模式选择器
    const modes = [
      { key: 'en2cn', label: '英译中' },
      { key: 'cn2en', label: '中译英' },
      { key: 'spelling', label: '拼写' }
    ];
    const modeBtns = modes.map(m =>
      `<button class="mode-btn ${m.key === mode ? 'active' : ''}" data-mode="${m.key}">${m.label}</button>`
    ).join('');

    if (mode === 'spelling') {
      return `<div class="page">
        <div class="mode-selector">${modeBtns}</div>
        <div class="quiz-header">
          <div class="quiz-progress">
            <span>${idx} / ${total}</span>
            <span style="color:var(--success);font-weight:600">${this.state.quizCorrect} 正确</span>
          </div>
          <button class="audio-btn" id="spellAudioBtn" style="margin:0 auto 12px">🔊</button>
          <div class="quiz-question" style="font-size:22px">${word.meaning}</div>
          <div class="quiz-sub">输入对应的英文单词</div>
        </div>
        <input class="spelling-input" id="spellingInput" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="输入英文单词...">
        <div class="spelling-hint" id="spellingHint"></div>
        <div style="margin-top:16px;display:flex;gap:8px">
          <button class="btn btn-outline btn-block" id="spellingSkipBtn">跳过</button>
          <button class="btn btn-primary btn-block" id="spellingCheckBtn">确认</button>
        </div>
      </div>`;
    }

    const isReverse = mode === 'cn2en';
    const options = isReverse ? SRS.getReverseQuizOptions(word) : SRS.getQuizOptions(word);

    return `<div class="page">
      <div class="mode-selector">${modeBtns}</div>
      <div class="quiz-header">
        <div class="quiz-progress">
          <span>${idx} / ${total}</span>
          <span style="color:var(--success);font-weight:600">${this.state.quizCorrect} 正确</span>
        </div>
        <button class="audio-btn" id="quizAudioBtn" style="margin:0 auto 12px">🔊</button>
        <div class="quiz-question">${isReverse ? word.meaning : word.word}</div>
        <div class="quiz-sub">${isReverse ? '选择正确的英文单词' : '选择正确的中文释义'}</div>
      </div>
      <div class="quiz-options" id="quizOptions">
        ${options.map((opt, i) =>
          `<button class="quiz-option" data-value="${opt}">${String.fromCharCode(65 + i)}. ${opt}</button>`
        ).join('')}
      </div>
      <div id="quizFeedback"></div>
    </div>`;
  },

  quizResultHTML() {
    const correct = this.state.quizCorrect;
    const total = this.state.quizTotal;
    const pct = total > 0 ? Math.round(correct / total * 100) : 0;
    const emoji = pct >= 80 ? '🌟' : pct >= 60 ? '👍' : '💪';
    return `<div class="page">
      <div class="quiz-result">
        <div style="font-size:48px;margin-bottom:8px">${emoji}</div>
        <div class="quiz-score">${pct}%</div>
        <div class="quiz-score-label">${correct} / ${total} 正确</div>
        <div style="margin:16px 0">${['没关系，错误是学习的一部分！','加油！多练几次就会了！','做得不错！继续努力！','太棒了！BEC 考试对你来说没问题！'][pct >= 90 ? 3 : pct >= 70 ? 2 : pct >= 50 ? 1 : 0]}</div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary btn-block" id="quizRetryBtn">再来一组</button>
        </div>
      </div>
    </div>`;
  },

  bindQuizResultEvents() {
    document.getElementById('quizRetryBtn')?.addEventListener('click', () => {
      this.state.quizWords = [];
      this.state.quizIndex = 0;
      this.state.isQuizResult = false;
      this.state.quizCorrect = 0;
      this.renderQuiz(document.getElementById('mainContent'));
    });
  },

  bindQuizEvents(word) {
    const mode = this.state.quizMode;

    // 模式切换
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.state.quizMode = btn.dataset.mode;
        this.state.quizWords = [];
        this.state.quizIndex = 0;
        this.state.isQuizResult = false;
        this.state.quizAnswered = false;
        this.renderQuiz(document.getElementById('mainContent'));
      });
    });

    // 语音
    const audios = ['quizAudioBtn', 'spellAudioBtn'];
    audios.forEach(id => {
      document.getElementById(id)?.addEventListener('click', () => this.speak(word.word));
    });

    if (mode === 'spelling') {
      this.bindSpelling(word);
      return;
    }

    // --- 选择题 ---
    const options = document.querySelectorAll('.quiz-option');
    let answered = false;

    options.forEach(opt => {
      opt.addEventListener('click', async () => {
        if (answered) return;
        answered = true;
        this.state.quizAnswered = true;

        const isReverse = mode === 'cn2en';
        const correctAnswer = isReverse ? word.word : word.meaning;
        const isCorrect = opt.dataset.value === correctAnswer;

        if (isCorrect) this.state.quizCorrect++;

        options.forEach(o => {
          o.classList.add('disabled');
          if (o.dataset.value === correctAnswer) o.classList.add('correct');
          if (o.dataset.value === opt.dataset.value && !isCorrect) o.classList.add('wrong');
        });

        // Save stats
        const today = await DB.getTodayStats();
        await DB.updateTodayStats({
          quizCorrect: today.quizCorrect + (isCorrect ? 1 : 0),
          quizTotal: today.quizTotal + 1
        });

        // Feedback
        const feedback = document.getElementById('quizFeedback');
        feedback.innerHTML = `<div class="quiz-feedback ${isCorrect ? 'correct' : 'wrong'}">
          ${isCorrect ? '✅ 回答正确!' : `❌ 正确答案: ${correctAnswer}`}
          <br><small>"${word.example}"</small>
        </div>
        <button class="btn btn-primary btn-block" id="quizNextBtn" style="margin-top:8px">
          ${this.state.quizIndex < this.state.quizTotal - 1 ? '下一题 →' : '查看结果'}
        </button>`;
        document.getElementById('quizNextBtn').addEventListener('click', () => this.nextQuiz());
      });
    });
  },

  /* ---- 拼写模式 ---- */
  bindSpelling(word) {
    const input = document.getElementById('spellingInput');
    const hint = document.getElementById('spellingHint');
    const skipBtn = document.getElementById('spellingSkipBtn');
    const checkBtn = document.getElementById('spellingCheckBtn');

    setTimeout(() => input?.focus(), 100);
    setTimeout(() => this.speak(word.word), 300);

    let answered = false;

    const finish = async (correct, userAnswer) => {
      answered = true;
      this.state.quizAnswered = true;

      if (correct) {
        this.state.quizCorrect++;
        input.classList.add('correct');
        hint.innerHTML = '✅ 完全正确!';
      } else {
        input.classList.add('wrong');
        hint.innerHTML = `❌ 正确答案: ${word.word} —— ${word.meaning}`;
      }

      const today = await DB.getTodayStats();
      await DB.updateTodayStats({
        quizCorrect: today.quizCorrect + (correct ? 1 : 0),
        quizTotal: today.quizTotal + 1
      });

      checkBtn.textContent = this.state.quizIndex < this.state.quizTotal - 1 ? '下一题 →' : '查看结果';
      checkBtn.onclick = () => this.nextQuiz();
      skipBtn.textContent = '查看答案';
      skipBtn.onclick = () => {};
    };

    const checkAnswer = async () => {
      if (answered) return;
      const userAns = input.value.trim().toLowerCase();
      const correct = word.word.toLowerCase();
      await finish(userAns === correct, userAns);
    };

    checkBtn.addEventListener('click', checkAnswer);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !answered) checkAnswer();
    });
    skipBtn.addEventListener('click', async () => {
      if (answered) return;
      await finish(false, '');
    });
  },

  nextQuiz() {
    this.state.quizIndex++;
    this.state.quizAnswered = false;
    if (this.state.quizIndex >= this.state.quizTotal) {
      this.state.isQuizResult = true;
    }
    this.renderQuiz(document.getElementById('mainContent'));
  },

  /* ============================================
     复习视图
     ============================================ */
  async renderReview(container) {
    const mastery = await SRS.getMasteryStats();
    const difficult = await SRS.getDifficultWords();

    const topicCards = TOPICS.map(t => {
      const s = mastery.topicStats[t] || { total: 0, mastered: 0, percent: 0 };
      const cls = s.percent >= 70 ? 'success' : s.percent >= 40 ? '' : 'warning';
      return `<div class="topic-card">
        <div class="topic-card-title">${t}</div>
        <div class="topic-card-progress">${s.mastered}/${s.total} 词</div>
        <div class="progress-bar"><div class="progress-fill ${cls}" style="width:${s.percent}%"></div></div>
      </div>`;
    }).join('');

    const diffHTML = difficult.length > 0
      ? difficult.slice(0, 10).map(d =>
        `<div class="review-word-item">
          <div class="review-word-main">
            <div class="review-word">${d.word?.word || '?'} <span style="font-size:12px;color:var(--text-secondary);font-weight:400">${d.word?.phonetic || ''}</span></div>
            <div class="review-meaning">${d.word?.meaning || ''}</div>
          </div>
          <span class="badge badge-danger">错${d.incorrectCount}次</span>
        </div>`).join('')
      : '<div class="empty-state" style="padding:20px"><p>✅ 暂无错题，继续保持！</p></div>';

    container.innerHTML = `<div class="page">
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-number">${difficult.length}</div><div class="stat-label">待复习</div></div>
        <div class="stat-card"><div class="stat-number">${mastery.mastered}</div><div class="stat-label">已掌握</div></div>
      </div>
      <div class="review-section-title">📂 按主题进度</div>
      <div class="review-topic-grid">${topicCards}</div>
      <div class="review-section-title">❌ 高频错词</div>
      ${diffHTML}
      <div style="margin-top:20px"><button class="btn btn-outline btn-block" id="resetBtn">🗑️ 重置所有学习数据</button></div>
    </div>`;

    document.getElementById('resetBtn')?.addEventListener('click', () => {
      if (confirm('确定要重置所有学习数据吗？此操作不可撤销。')) {
        DB.clearAll().then(() => {
          this.showToast('数据已重置');
          this.renderReview(document.getElementById('mainContent'));
        });
      }
    });
  },

  /* ============================================
     统计视图
     ============================================ */
  async renderStats(container) {
    const today = await DB.getTodayStats();
    const mastery = await SRS.getMasteryStats();
    const weekData = await SRS.getWeekStats();
    const allProgress = await DB.getAllProgress();

    const maxCount = Math.max(...weekData.map(d => d.count), 1);
    const chartBars = weekData.map(d => {
      const h = d.count / maxCount * 80;
      const isToday = d.label === '今天';
      return `<div class="chart-bar-wrap">
        <div class="chart-bar ${isToday ? 'today' : ''}" style="height:${Math.max(h, 2)}px"></div>
        <div class="chart-label">${d.label}</div>
      </div>`;
    }).join('');

    const quizTotal = allProgress.reduce((s, p) => s + p.correctCount + p.incorrectCount, 0);
    const quizCorrect = allProgress.reduce((s, p) => s + p.correctCount, 0);
    const accuracy = quizTotal > 0 ? Math.round(quizCorrect / quizTotal * 100) : 0;

    container.innerHTML = `<div class="page">
      <div class="stats-grid">
        <div class="streak-card">
          <div class="streak-fire">🔥</div>
          <div>
            <div class="streak-text">连续学习 ${today.streak || 0} 天</div>
            <div class="streak-sub">今日已学 ${today.learned || 0} 词</div>
          </div>
        </div>
      </div>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-number">${mastery.learned}</div><div class="stat-label">已学单词</div></div>
        <div class="stat-card"><div class="stat-number">${accuracy}%</div><div class="stat-label">总正确率</div></div>
        <div class="stat-card"><div class="stat-number">${mastery.mastered}</div><div class="stat-label">已掌握</div></div>
        <div class="stat-card"><div class="stat-number">${mastery.total - mastery.learned}</div><div class="stat-label">未学习</div></div>
      </div>
      <div class="card chart-section">
        <div style="font-size:14px;font-weight:600;margin-bottom:4px">近7天学习</div>
        <div class="chart-bars">${chartBars}</div>
      </div>
      <div class="card">
        <div style="font-size:14px;font-weight:600;margin-bottom:8px">总进度</div>
        <div class="progress-bar" style="height:10px">
          <div class="progress-fill success" style="width:${Math.round(mastery.learned / mastery.total * 100)}%"></div>
        </div>
        <div style="font-size:13px;color:var(--text-secondary);margin-top:6px">已完成 ${mastery.learned} / ${mastery.total} 词</div>
      </div>
    </div>`;
  },

  /* ============================================
     设置
     ============================================ */
  bindSettingsEvents() {
    document.getElementById('settingsBtn')?.addEventListener('click', () => this.toggleSettings(true));
  },

  toggleSettings(open) {
    this.state.settingsOpen = open;
    const overlay = document.getElementById('settingsOverlay');
    const panel = document.getElementById('settingsPanel');
    if (!overlay) {
      this.createSettingsPanel();
      return;
    }
    overlay.classList.toggle('open', open);
    panel.classList.toggle('open', open);
  },

  createSettingsPanel() {
    const overlay = document.createElement('div');
    overlay.className = 'settings-overlay';
    overlay.id = 'settingsOverlay';

    const panel = document.createElement('div');
    panel.className = 'settings-panel';
    panel.id = 'settingsPanel';
    panel.innerHTML = `
      <div class="settings-handle"></div>
      <div class="settings-title">设置</div>
      <div class="settings-item">
        <span class="settings-label">词库</span>
        <span class="settings-action" style="color:var(--text-secondary)">BEC中级 · 160词</span>
      </div>
      <div class="settings-item">
        <button class="settings-action" id="settingsResetBtn">🗑️ 重置所有学习数据</button>
      </div>
      <div style="margin-top:16px">
        <button class="btn btn-primary btn-block" id="settingsCloseBtn">关闭</button>
      </div>`;

    document.body.appendChild(overlay);
    document.body.appendChild(panel);

    overlay.addEventListener('click', () => this.toggleSettings(false));
    document.getElementById('settingsCloseBtn')?.addEventListener('click', () => this.toggleSettings(false));
    document.getElementById('settingsResetBtn')?.addEventListener('click', () => {
      if (confirm('确定要重置所有学习数据吗？')) {
        DB.clearAll().then(() => {
          this.showToast('数据已重置');
          this.toggleSettings(false);
          this.navigate(this.state.currentView);
        });
      }
    });

    overlay.classList.add('open');
    panel.classList.add('open');
  },

  /* ---- Toast ---- */
  showToast(msg) {
    document.querySelector('.toast')?.remove();
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2000);
  }
};

/* ---- 启动 ---- */
document.addEventListener('DOMContentLoaded', () => {
  if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
  }
  App.init().catch(e => {
    console.error('App init failed:', e);
    document.getElementById('mainContent').innerHTML =
      `<div class="page empty-state"><p>应用启动失败: ${e.message}</p><button class="btn btn-primary" onclick="location.reload()">重试</button></div>`;
  });
});
