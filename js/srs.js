/* SRS 间隔重复引擎 (基于 SM-2 算法) */

const SRS = {
  /* 间隔天数: 级别 -> 天数 */
  intervals: [0, 1, 3, 7, 14, 30, 60],

  /* 每级对应的标签 */
  levelLabels: ['新词', '熟悉', '已记', '巩固', '熟练', '掌握', '精通'],

  /* 学习一个单词后的处理 */
  review(wordId, correct) {
    return DB.getProgress(wordId).then(progress => {
      if (!progress) {
        progress = {
          wordId,
          level: 0,
          correctCount: 0,
          incorrectCount: 0,
          consecutiveCorrect: 0,
          nextReview: Date.now(),
          lastReviewed: null,
          history: []
        };
      }

      // 记录历史
      progress.history.push({
        date: Date.now(),
        correct
      });
      // 只保留最近50条
      if (progress.history.length > 50) {
        progress.history = progress.history.slice(-50);
      }

      if (correct) {
        progress.correctCount++;
        progress.consecutiveCorrect++;
        // SM-2: 连续正确就升级
        const levelUp = progress.consecutiveCorrect >= 2 || progress.level === 0;
        if (levelUp) {
          progress.level = Math.min(progress.level + 1, 6);
          progress.consecutiveCorrect = 0;
        }
      } else {
        progress.incorrectCount++;
        progress.consecutiveCorrect = 0;
        // 答错降级 (至少保留在 level 0)
        if (progress.level > 0) {
          progress.level = Math.max(progress.level - 1, 0);
        }
      }

      // 计算下次复习时间
      const interval = this.intervals[progress.level] || 60;
      progress.nextReview = Date.now() + interval * 24 * 60 * 60 * 1000;
      progress.lastReviewed = Date.now();

      return DB.saveProgress(progress).then(() => progress);
    });
  },

  /* 获取今天需要复习的单词 (按 topic 分组) */
  async getDueWords(topic = null) {
    const allProgress = await DB.getAllProgress();
    const now = Date.now();

    let due = [];
    const words = topic
      ? WORDS.filter(w => w.topic === topic)
      : WORDS;

    for (const word of words) {
      const progress = allProgress.find(p => p.wordId === word.id);
      if (!progress || progress.nextReview <= now) {
        due.push(word);
      }
    }

    // 排序: 从未学的优先, 然后按 overdue 时间
    due.sort((a, b) => {
      const pa = allProgress.find(p => p.wordId === a.id);
      const pb = allProgress.find(p => p.wordId === b.id);
      if (!pa && !pb) return 0;
      if (!pa) return -1;
      if (!pb) return 1;
      return pa.nextReview - pb.nextReview;
    });

    return due;
  },

  /* 获取某个词的当前进度 */
  async getWordProgress(wordId) {
    return DB.getProgress(wordId);
  },

  /* 获取掌握度统计 */
  async getMasteryStats() {
    const allProgress = await DB.getAllProgress();
    const total = WORDS.length;
    const learned = allProgress.length;
    const mastered = allProgress.filter(p => p.level >= 4).length;
    const reviewing = allProgress.filter(p => p.level >= 1 && p.level <= 3).length;

    // 按 topic 统计
    const topicStats = {};
    for (const topic of TOPICS) {
      const topicWords = WORDS.filter(w => w.topic === topic);
      const topicProgress = allProgress.filter(p =>
        topicWords.some(w => w.id === p.wordId)
      );
      const masteredCount = topicProgress.filter(p => p.level >= 3).length;
      topicStats[topic] = {
        total: topicWords.length,
        learned: topicProgress.length,
        mastered: masteredCount,
        percent: Math.round((masteredCount / topicWords.length) * 100)
      };
    }

    return { total, learned, mastered, reviewing, topicStats };
  },

  /* 获取 quiz 选项 (1个正确 + 3个干扰项) */
  getQuizOptions(correctWord, count = 4) {
    const others = WORDS.filter(w => w.id !== correctWord.id);
    const shuffled = others.sort(() => Math.random() - 0.5);
    const options = shuffled.slice(0, count - 1).map(w => w.meaning);
    options.push(correctWord.meaning);
    return options.sort(() => Math.random() - 0.5);
  },

  /* 生成反向 quiz 选项 (看中文选英文) */
  getReverseQuizOptions(correctWord, count = 4) {
    const others = WORDS.filter(w => w.id !== correctWord.id);
    const shuffled = others.sort(() => Math.random() - 0.5);
    const options = shuffled.slice(0, count - 1).map(w => w.word);
    options.push(correctWord.word);
    return options.sort(() => Math.random() - 0.5);
  },

  /* 获取最近7天学习数据 */
  async getWeekStats() {
    const allStats = await DB.getAllStats();
    const days = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const dayStats = allStats.find(s => s.date === dateStr);
      days.push({
        date: dateStr,
        label: i === 0 ? '今天' : `${d.getMonth()+1}/${d.getDate()}`,
        count: dayStats ? dayStats.learned : 0
      });
    }
    return days;
  },

  /* 获取错题本 (经常答错的词) */
  async getDifficultWords(limit = 20) {
    const allProgress = await DB.getAllProgress();
    const difficult = allProgress
      .filter(p => p.incorrectCount > 0)
      .sort((a, b) => {
        // 按错误率排序
        const rateA = a.incorrectCount / (a.correctCount + a.incorrectCount || 1);
        const rateB = b.incorrectCount / (b.correctCount + b.incorrectCount || 1);
        return rateB - rateA;
      })
      .slice(0, limit);

    return difficult.map(p => {
      const word = WORDS.find(w => w.id === p.wordId);
      return { ...p, word };
    }).filter(item => item.word);
  }
};
