/* ==========================================================================
   FocusFlow Engine
   ========================================================================== */

// Default Configurations
const DEFAULTS = {
  work: 25,          // minutes
  shortBreak: 5,     // minutes
  longBreak: 15,     // minutes
  notify: true,
  sound: true,
  theme: 'dark'
};

// Application State
let state = {
  mode: 'work', // 'work', 'shortBreak', 'longBreak'
  isRunning: false,
  timeLeft: 25 * 60, // seconds
  totalDuration: 25 * 60, // seconds for active progress ring
  endTime: null, // absolute timestamp when interval ends
  timerInterval: null,
  workSessionsCompleted: 0,
  tasks: [],
  activeTaskId: null,
  settings: { ...DEFAULTS }
};

// SVG Circle circumference config
const CIRCLE_RADIUS = 126;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;

// DOM Elements cache
const DOM = {
  timerCountdown: document.getElementById('timer-countdown'),
  sessionCycleText: document.getElementById('session-cycle-text'),
  activeFocusTaskTitle: document.getElementById('active-focus-task-title'),
  activeFocusContainer: document.getElementById('active-focus-container'),
  progressCircle: document.getElementById('progress-circle'),
  playBtn: document.getElementById('play-btn'),
  playIcon: document.getElementById('play-icon'),
  pauseIcon: document.getElementById('pause-icon'),
  resetBtn: document.getElementById('reset-btn'),
  skipBtn: document.getElementById('skip-btn'),
  themeToggle: document.getElementById('theme-toggle'),
  settingsToggle: document.getElementById('settings-toggle'),
  closeSettings: document.getElementById('close-settings'),
  settingsModal: document.getElementById('settings-modal'),
  settingsForm: document.getElementById('settings-form'),
  resetSettingsBtn: document.getElementById('reset-settings'),
  
  // Settings Inputs
  workDurationInput: document.getElementById('work-duration'),
  shortBreakDurationInput: document.getElementById('short-break-duration'),
  longBreakDurationInput: document.getElementById('long-break-duration'),
  notifyPref: document.getElementById('notify-pref'),
  soundPref: document.getElementById('sound-pref'),
  
  // Task manager inputs
  taskForm: document.getElementById('task-form'),
  taskInput: document.getElementById('task-input'),
  tasksList: document.getElementById('tasks-list')
};

/* ==========================================================================
   Sound Synthesis Engine (Web Audio API)
   ========================================================================== */
function playChimeNotification() {
  if (!state.settings.sound) return;

  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    
    const ctx = new AudioContext();
    
    // Smooth chime synth: note A5 (880Hz) followed closely by E6 (1318.5Hz)
    const playNote = (freq, time, duration) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);
      
      gainNode.gain.setValueAtTime(0.2, time);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, time + duration);
      
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      osc.start(time);
      osc.stop(time + duration);
    };

    const now = ctx.currentTime;
    playNote(880, now, 0.8);
    playNote(1318.51, now + 0.15, 1.2);
  } catch (err) {
    console.warn("Audio Context block or unsupported browser: ", err);
  }
}

/* ==========================================================================
   Timer Logic
   ========================================================================== */

// Update UI text and circular progress bar
function updateTimerUI() {
  const mins = Math.floor(state.timeLeft / 60);
  const secs = state.timeLeft % 60;
  const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  
  DOM.timerCountdown.textContent = timeStr;
  
  // Update document title to reflect remaining time
  const modeLabel = state.mode === 'work' ? 'Focus' : 'Break';
  document.title = `${timeStr} (${modeLabel}) | FocusFlow`;

  // Compute Circular progress offset
  const ratio = state.timeLeft / state.totalDuration;
  const offset = CIRCLE_CIRCUMFERENCE - (ratio * CIRCLE_CIRCUMFERENCE);
  DOM.progressCircle.style.strokeDashoffset = offset;
}

// Get mode display labels
function getModeLabel(mode) {
  switch (mode) {
    case 'work': return 'Work Session';
    case 'shortBreak': return 'Short Break';
    case 'longBreak': return 'Long Break';
  }
}

// Change current mode
function setTimerMode(mode, runNow = false) {
  state.mode = mode;
  state.isRunning = false;
  clearInterval(state.timerInterval);
  
  // Dynamic visual adjustment
  const activeTab = document.querySelector(`.tab-btn[data-mode="${mode}"]`);
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  if (activeTab) activeTab.classList.add('active');

  // Change Theme Color Scheme depending on session type
  if (mode === 'work') {
    document.documentElement.style.setProperty('--primary-accent', 'var(--focus-accent)');
    document.documentElement.style.setProperty('--primary-glow', 'var(--focus-glow)');
  } else {
    document.documentElement.style.setProperty('--primary-accent', 'var(--break-accent)');
    document.documentElement.style.setProperty('--primary-glow', 'var(--break-glow)');
  }

  // Set times
  const minutes = state.settings[mode];
  state.timeLeft = minutes * 60;
  state.totalDuration = minutes * 60;
  
  DOM.sessionCycleText.textContent = getModeLabel(mode);
  
  updateTimerUI();
  togglePlayIcons(false);
  
  if (runNow) {
    startTimer();
  }
}

// Start countdown
function startTimer() {
  if (state.isRunning) return;
  
  state.isRunning = true;
  state.endTime = Date.now() + state.timeLeft * 1000;
  
  togglePlayIcons(true);
  
  state.timerInterval = setInterval(() => {
    tickTimer();
  }, 200); // Poll faster than 1s to ensure UI feels highly responsive
}

// Stop countdown
function pauseTimer() {
  if (!state.isRunning) return;
  
  state.isRunning = false;
  clearInterval(state.timerInterval);
  
  // Calculate remaining time precisely
  state.timeLeft = Math.max(0, Math.round((state.endTime - Date.now()) / 1000));
  
  togglePlayIcons(false);
  updateTimerUI();
}

// Periodic tick recalculations
function tickTimer() {
  const remaining = Math.round((state.endTime - Date.now()) / 1000);
  
  if (remaining <= 0) {
    state.timeLeft = 0;
    updateTimerUI();
    handleSessionComplete();
  } else {
    state.timeLeft = remaining;
    updateTimerUI();
  }
}

// Session Complete Trigger
function handleSessionComplete() {
  pauseTimer();
  playChimeNotification();
  triggerDesktopAlert();
  
  // Sequence calculation
  if (state.mode === 'work') {
    state.workSessionsCompleted++;
    if (state.workSessionsCompleted >= 4) {
      state.workSessionsCompleted = 0;
      setTimerMode('longBreak');
    } else {
      setTimerMode('shortBreak');
    }
  } else {
    setTimerMode('work');
  }
}

// Toggle play button display SVGs
function togglePlayIcons(playing) {
  if (playing) {
    DOM.playIcon.classList.add('hidden');
    DOM.pauseIcon.classList.remove('hidden');
  } else {
    DOM.playIcon.classList.remove('hidden');
    DOM.pauseIcon.classList.add('hidden');
  }
}

// Skip button sequence jumping
function skipSession() {
  pauseTimer();
  if (state.mode === 'work') {
    state.workSessionsCompleted++;
    if (state.workSessionsCompleted >= 4) {
      state.workSessionsCompleted = 0;
      setTimerMode('longBreak');
    } else {
      setTimerMode('shortBreak');
    }
  } else {
    setTimerMode('work');
  }
}

/* ==========================================================================
   Page Visibility API
   ========================================================================== */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.isRunning) {
    // Force instant tick updates when backgrounding tab becomes active again
    tickTimer();
  }
});

/* ==========================================================================
   Web Notifications API
   ========================================================================== */

// Request system notification permissions
function requestNotificationPermission() {
  if (state.settings.notify && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

// Launch notification banner
function triggerDesktopAlert() {
  if (!state.settings.notify || Notification.permission !== 'granted') return;
  
  let title = "";
  let bodyText = "";
  
  if (state.mode === 'work') {
    title = "Focus Session Completed! 🌟";
    bodyText = "Amazing work! Let's take a break. Ready to start?";
  } else {
    title = "Break Finished! ⚡";
    bodyText = "Feel refreshed? Let's flow. Tap here to start focus session.";
  }

  const notification = new Notification(title, {
    body: bodyText,
    icon: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23ff6b4a"><circle cx="12" cy="12" r="10"/></svg>'
  });

  notification.onclick = () => {
    window.focus();
    startTimer();
  };
}

/* ==========================================================================
   Task manager Engine
   ========================================================================== */

function loadTasks() {
  const saved = localStorage.getItem('focusflow_tasks');
  const activeId = localStorage.getItem('focusflow_active_task');
  state.tasks = saved ? JSON.parse(saved) : [];
  state.activeTaskId = activeId || null;
  renderTasks();
  updateActiveFocusUI();
}

function saveTasks() {
  localStorage.setItem('focusflow_tasks', JSON.stringify(state.tasks));
  if (state.activeTaskId) {
    localStorage.setItem('focusflow_active_task', state.activeTaskId);
  } else {
    localStorage.removeItem('focusflow_active_task');
  }
  updateActiveFocusUI();
}

function addTask(title) {
  const newTask = {
    id: 'task_' + Date.now() + '_' + Math.floor(Math.random()*1000),
    title,
    completed: false
  };
  state.tasks.push(newTask);
  
  // Auto set active if none exist
  if (!state.activeTaskId) {
    state.activeTaskId = newTask.id;
  }
  
  saveTasks();
  renderTasks();
}

function deleteTask(id) {
  state.tasks = state.tasks.filter(t => t.id !== id);
  if (state.activeTaskId === id) {
    state.activeTaskId = state.tasks.length > 0 ? state.tasks[0].id : null;
  }
  saveTasks();
  renderTasks();
}

function toggleTaskComplete(id) {
  const task = state.tasks.find(t => t.id === id);
  if (task) {
    task.completed = !task.completed;
    saveTasks();
    renderTasks();
  }
}

function selectActiveFocusTask(id) {
  state.activeTaskId = id;
  saveTasks();
  renderTasks();
}

// Render checklists
function renderTasks() {
  DOM.tasksList.innerHTML = '';
  
  if (state.tasks.length === 0) {
    DOM.tasksList.innerHTML = `
      <div class="empty-tasks-state">
        <p>Your focus list is empty.</p>
        <span>Add a task above to start tracking.</span>
      </div>
    `;
    return;
  }

  state.tasks.forEach(task => {
    const item = document.createElement('div');
    item.className = `task-item ${task.completed ? 'completed' : ''} ${state.activeTaskId === task.id ? 'active-focus' : ''}`;
    item.dataset.id = task.id;

    item.innerHTML = `
      <div class="task-left-section">
        <label class="checkbox-container">
          <input type="checkbox" ${task.completed ? 'checked' : ''} onchange="toggleTaskComplete('${task.id}')">
          <span class="checkmark"></span>
        </label>
        <span class="task-title" title="${task.title}">${task.title}</span>
      </div>
      <div class="task-actions">
        <button class="btn-task-action btn-focus-task" onclick="selectActiveFocusTask('${task.id}')" title="Set as focus target">
          <svg class="btn-icon-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <circle cx="12" cy="12" r="2"></circle>
          </svg>
        </button>
        <button class="btn-task-action btn-delete-task" onclick="deleteTask('${task.id}')" title="Delete task">
          <svg class="btn-icon-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `;

    DOM.tasksList.appendChild(item);
  });
}

// Update Active Focus text displays
function updateActiveFocusUI() {
  const activeTask = state.tasks.find(t => t.id === state.activeTaskId);
  if (activeTask) {
    DOM.activeFocusTaskTitle.textContent = activeTask.title;
    DOM.activeFocusContainer.classList.remove('hidden');
  } else {
    DOM.activeFocusTaskTitle.textContent = "No task selected";
    DOM.activeFocusContainer.classList.add('hidden');
  }
}

// Expose handlers to checklist click contexts
window.toggleTaskComplete = toggleTaskComplete;
window.selectActiveFocusTask = selectActiveFocusTask;
window.deleteTask = deleteTask;

/* ==========================================================================
   Settings Management
   ========================================================================== */

function loadSettings() {
  const saved = localStorage.getItem('focusflow_settings');
  state.settings = saved ? JSON.parse(saved) : { ...DEFAULTS };
  
  // Fill inputs
  DOM.workDurationInput.value = state.settings.work;
  DOM.shortBreakDurationInput.value = state.settings.shortBreak;
  DOM.longBreakDurationInput.value = state.settings.longBreak;
  DOM.notifyPref.checked = state.settings.notify;
  DOM.soundPref.checked = state.settings.sound;

  // Load theme preference
  applyTheme(state.settings.theme);

  // Sync initial countdown limits
  setTimerMode(state.mode);
}

function saveSettings(e) {
  e.preventDefault();
  
  state.settings.work = parseInt(DOM.workDurationInput.value, 10);
  state.settings.shortBreak = parseInt(DOM.shortBreakDurationInput.value, 10);
  state.settings.longBreak = parseInt(DOM.longBreakDurationInput.value, 10);
  state.settings.notify = DOM.notifyPref.checked;
  state.settings.sound = DOM.soundPref.checked;

  localStorage.setItem('focusflow_settings', JSON.stringify(state.settings));
  
  // Apply changes to timer values
  setTimerMode(state.mode);
  
  // Request notifications if enabled
  if (state.settings.notify) {
    requestNotificationPermission();
  }
  
  closeSettingsModal();
}

function resetSettings() {
  DOM.workDurationInput.value = DEFAULTS.work;
  DOM.shortBreakDurationInput.value = DEFAULTS.shortBreak;
  DOM.longBreakDurationInput.value = DEFAULTS.longBreak;
  DOM.notifyPref.checked = DEFAULTS.notify;
  DOM.soundPref.checked = DEFAULTS.sound;
}

function openSettingsModal() {
  DOM.settingsModal.classList.add('open');
}

function closeSettingsModal() {
  DOM.settingsModal.classList.remove('open');
}

/* ==========================================================================
   Theme Management
   ========================================================================== */

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  state.settings.theme = theme;
  localStorage.setItem('focusflow_settings', JSON.stringify(state.settings));
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const target = current === 'dark' ? 'light' : 'dark';
  applyTheme(target);
}

/* ==========================================================================
   Initialization & Listeners
   ========================================================================== */

function init() {
  // SVG Ring initial setup
  DOM.progressCircle.style.strokeDasharray = CIRCLE_CIRCUMFERENCE;
  DOM.progressCircle.style.strokeDashoffset = 0;

  // Settings loader
  loadSettings();
  
  // Tasks loader
  loadTasks();

  // Mode tab selectors
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setTimerMode(btn.dataset.mode);
    });
  });

  // Play Pause controls
  DOM.playBtn.addEventListener('click', () => {
    if (state.isRunning) {
      pauseTimer();
    } else {
      // Audio permission grant on first click
      requestNotificationPermission();
      startTimer();
    }
  });

  DOM.resetBtn.addEventListener('click', () => {
    setTimerMode(state.mode);
  });

  DOM.skipBtn.addEventListener('click', () => {
    skipSession();
  });

  // Header click triggers
  DOM.themeToggle.addEventListener('click', toggleTheme);
  DOM.settingsToggle.addEventListener('click', openSettingsModal);
  DOM.closeSettings.addEventListener('click', closeSettingsModal);

  // Settings Form triggers
  DOM.settingsForm.addEventListener('submit', saveSettings);
  DOM.resetSettingsBtn.addEventListener('click', resetSettings);

  // Outside click close settings
  DOM.settingsModal.addEventListener('click', (e) => {
    if (e.target === DOM.settingsModal) {
      closeSettingsModal();
    }
  });

  // Task List addition triggers
  DOM.taskForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = DOM.taskInput.value.trim();
    if (val) {
      addTask(val);
      DOM.taskInput.value = '';
    }
  });
}

// Launch app
document.addEventListener('DOMContentLoaded', init);
