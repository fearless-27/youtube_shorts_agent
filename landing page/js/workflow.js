/**
 * NEMO / NEMO Autonomous Workflow Controller
 * Manages stage switching, interactive telemetry, and scroll hooks
 */
(function () {
  'use strict';

  function initWorkflow() {
    const workflowSection = document.getElementById('workflow-pipeline');
    if (!workflowSection) return;

    const navButtons = workflowSection.querySelectorAll('.wf-step-btn');
    const stagePanels = workflowSection.querySelectorAll('.wf-stage-panel');
    const progressBar = workflowSection.querySelector('.wf-progress-fill');

    if (!navButtons.length || !stagePanels.length) return;

    function switchStage(targetIndex) {
      navButtons.forEach((btn, idx) => {
        if (idx === targetIndex) {
          btn.classList.add('is-active');
          btn.setAttribute('aria-selected', 'true');
        } else {
          btn.classList.remove('is-active');
          btn.setAttribute('aria-selected', 'false');
        }
      });

      stagePanels.forEach((panel, idx) => {
        if (idx === targetIndex) {
          panel.classList.add('is-active');
          panel.removeAttribute('hidden');
        } else {
          panel.classList.remove('is-active');
          panel.setAttribute('hidden', '');
        }
      });

      if (progressBar) {
        const pct = ((targetIndex + 1) / navButtons.length) * 100;
        progressBar.style.width = `${pct}%`;
      }
    }

    navButtons.forEach((btn, index) => {
      btn.addEventListener('click', () => {
        switchStage(index);
      });
    });

    // Keyboard accessibility
    navButtons.forEach((btn, index) => {
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          const next = (index + 1) % navButtons.length;
          navButtons[next].focus();
          switchStage(next);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          const prev = (index - 1 + navButtons.length) % navButtons.length;
          navButtons[prev].focus();
          switchStage(prev);
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWorkflow);
  } else {
    initWorkflow();
  }
})();
