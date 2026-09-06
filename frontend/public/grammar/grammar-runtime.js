/**
 * Vanilla-JS port of the authenticated app's tab switching (GrammarPointDetailPage.tsx)
 * and exercise practice flow (GrammarExercises.tsx) for the public, logged-out grammar
 * pages. No network calls: the AI-explanation fallback and "More explanation" chat button
 * from the real component are intentionally dropped, since those hit the backend.
 * Uses the exact same CSS classes as the real app (see grammar.css) for visual parity.
 */
(function () {
  "use strict";

  function initTabs() {
    var buttons = document.querySelectorAll("[data-tab-button]");
    var panels = document.querySelectorAll("[data-tab-panel]");
    buttons.forEach(function (button) {
      button.addEventListener("click", function () {
        var target = button.getAttribute("data-tab-button");
        buttons.forEach(function (b) {
          var active = b === button;
          b.classList.toggle("grammar-detail-tab-active", active);
          b.setAttribute("aria-selected", String(active));
        });
        panels.forEach(function (panel) {
          panel.classList.toggle(
            "grammar-detail-hidden",
            panel.getAttribute("data-tab-panel") !== target,
          );
        });
      });
    });
  }

  function shuffledIndices(length) {
    var indices = [];
    for (var i = 0; i < length; i += 1) indices.push(i);
    for (var i = indices.length - 1; i > 0; i -= 1) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = indices[i];
      indices[i] = indices[j];
      indices[j] = tmp;
    }
    return indices;
  }

  function normalizeAnswer(value) {
    return value.trim().replace(/[。.!?！？，,]+$/g, "");
  }

  function isTextAnswerCorrect(value, accepted) {
    var normalized = normalizeAnswer(value);
    return accepted.some(function (candidate) {
      return normalizeAnswer(candidate) === normalized;
    });
  }

  function scoreBand(percentage) {
    if (percentage >= 80) return "good";
    if (percentage >= 50) return "medium";
    return "low";
  }

  var SCORE_MESSAGES = {
    good: function (p) {
      return "You scored " + p + "%. Great job, you passed this test!";
    },
    medium: function (p) {
      return (
        "You scored " +
        p +
        "%. You're on the right track — train on this topic again to raise your score."
      );
    },
    low: function (p) {
      return (
        "You scored " +
        p +
        "%. This grammar point isn't quite settled yet — go back over the explanation, you'll get it!"
      );
    },
  };
  var SCORE_CLASS = { good: "score-good", medium: "score-medium", low: "score-low" };
  var GAUGE_CLASS = {
    good: "gauge-progress-good",
    medium: "gauge-progress-medium",
    low: "gauge-progress-low",
  };

  var GAUGE_RADIUS = 52;
  var GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

  function el(tag, className, attrs) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        node.setAttribute(key, attrs[key]);
      });
    }
    return node;
  }

  function initExercises() {
    var root = document.getElementById("exercises-root");
    var dataEl = document.getElementById("exercise-data");
    if (!root || !dataEl) return;
    var exercises = JSON.parse(dataEl.textContent);

    var state = { index: 0, correctCount: 0, finished: false };

    function render() {
      root.innerHTML = "";
      if (exercises.length === 0) {
        var empty = el("p", "exercises-empty");
        empty.textContent = "No exercises available yet.";
        root.appendChild(empty);
        return;
      }
      if (state.finished) {
        renderScore();
        return;
      }
      renderQuestion();
    }

    function renderScore() {
      var percentage = Math.round((state.correctCount / exercises.length) * 100);
      var band = scoreBand(percentage);
      var wrap = el("div", "exercises-score");

      var gaugeWrap = el("div", "gauge-wrap");
      var svgNS = "http://www.w3.org/2000/svg";
      var svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("viewBox", "0 0 120 120");
      svg.setAttribute("class", "gauge");
      var track = document.createElementNS(svgNS, "circle");
      track.setAttribute("cx", "60");
      track.setAttribute("cy", "60");
      track.setAttribute("r", String(GAUGE_RADIUS));
      track.setAttribute("class", "gauge-track");
      var progressCircle = document.createElementNS(svgNS, "circle");
      progressCircle.setAttribute("cx", "60");
      progressCircle.setAttribute("cy", "60");
      progressCircle.setAttribute("r", String(GAUGE_RADIUS));
      progressCircle.setAttribute("class", GAUGE_CLASS[band]);
      progressCircle.setAttribute("stroke-dasharray", String(GAUGE_CIRCUMFERENCE));
      progressCircle.setAttribute("stroke-dashoffset", String(GAUGE_CIRCUMFERENCE));
      svg.appendChild(track);
      svg.appendChild(progressCircle);
      var gaugeText = el("span", "gauge-text");
      gaugeText.textContent = "0%";
      gaugeWrap.appendChild(svg);
      gaugeWrap.appendChild(gaugeText);
      wrap.appendChild(gaugeWrap);

      var reveal = el("div", "score-reveal-hidden");
      var message = el("p", SCORE_CLASS[band]);
      message.textContent = SCORE_MESSAGES[band](percentage);
      var againBtn = el("button", "btn btn-cancel btn-page", { type: "button" });
      againBtn.textContent = "Try again";
      againBtn.addEventListener("click", function () {
        state.index = 0;
        state.correctCount = 0;
        state.finished = false;
        render();
      });
      reveal.appendChild(message);
      reveal.appendChild(againBtn);
      wrap.appendChild(reveal);
      root.appendChild(wrap);

      requestAnimationFrame(function () {
        var offset = GAUGE_CIRCUMFERENCE - (percentage / 100) * GAUGE_CIRCUMFERENCE;
        progressCircle.style.transition = "stroke-dashoffset 1.1s ease-out";
        progressCircle.setAttribute("stroke-dashoffset", String(offset));
        var start = null;
        function step(ts) {
          if (!start) start = ts;
          var ratio = Math.min(1, (ts - start) / 1100);
          gaugeText.textContent = Math.round(ratio * percentage) + "%";
          if (ratio < 1) {
            requestAnimationFrame(step);
          } else {
            gaugeText.textContent = percentage + "%";
            reveal.className = "score-reveal";
          }
        }
        requestAnimationFrame(step);
      });
    }

    function renderQuestion() {
      var exercise = exercises[state.index];
      var displayOrder =
        exercise.type === "multiple_choice"
          ? shuffledIndices(exercise.choices.length)
          : exercise.type === "sentence_reordering"
            ? shuffledIndices(exercise.tokens.length)
            : [];

      var qState = {
        validated: false,
        isCorrect: false,
        selectedChoice: null,
        orderedIndices: [],
        textAnswer: "",
      };

      var container = el("div", "exercises");
      var progress = el("p", "exercises-progress");
      progress.textContent = "Question " + (state.index + 1) + " of " + exercises.length;
      container.appendChild(progress);

      var questionBox = el("div", "exercises-question");
      container.appendChild(questionBox);

      var footer = el("div", "exercises-footer");
      var feedback = el("div", "exercises-feedback");
      var feedbackText = el("p", "");
      feedback.appendChild(feedbackText);
      footer.appendChild(feedback);
      var actionSlot = el("div", "");
      footer.appendChild(actionSlot);
      container.appendChild(footer);

      function updateActionButton() {
        actionSlot.innerHTML = "";
        var canValidate =
          exercise.type === "multiple_choice"
            ? qState.selectedChoice !== null
            : exercise.type === "sentence_reordering"
              ? qState.orderedIndices.length === exercise.tokens.length
              : qState.textAnswer.trim().length > 0;

        if (!qState.validated) {
          var validateBtn = el("button", "btn btn-confirm btn-page", { type: "button" });
          validateBtn.textContent = "Validate";
          validateBtn.disabled = !canValidate;
          validateBtn.addEventListener("click", validate);
          actionSlot.appendChild(validateBtn);
        } else {
          var nextBtn = el("button", "btn btn-confirm btn-page", { type: "button" });
          nextBtn.textContent = state.index + 1 >= exercises.length ? "See score" : "Next";
          nextBtn.addEventListener("click", next);
          actionSlot.appendChild(nextBtn);
        }
      }

      function renderQuestionBody() {
        questionBox.innerHTML = "";

        if (exercise.type === "multiple_choice") {
          var p = el("p", "");
          p.textContent = exercise.question;
          questionBox.appendChild(p);
          var choicesWrap = el("div", "exercises-choices");
          displayOrder.forEach(function (choiceIndex) {
            var btn = el("button", "exercises-choice", { type: "button" });
            btn.textContent = exercise.choices[choiceIndex];
            btn.disabled = qState.validated;
            var isSelected = qState.selectedChoice === choiceIndex;
            var isAnswer = choiceIndex === exercise.answer;
            if (qState.validated && isAnswer) btn.classList.add("choice-correct");
            else if (qState.validated && isSelected && !isAnswer)
              btn.classList.add("choice-incorrect");
            else if (isSelected) btn.classList.add("choice-selected");
            btn.addEventListener("click", function () {
              qState.selectedChoice = choiceIndex;
              renderQuestionBody();
              updateActionButton();
            });
            choicesWrap.appendChild(btn);
          });
          questionBox.appendChild(choicesWrap);
        }

        if (exercise.type === "sentence_reordering") {
          var instr = el("p", "");
          instr.textContent = "Put the words in the right order.";
          questionBox.appendChild(instr);
          var answerArea = el("div", "exercises-answer-area");
          if (qState.orderedIndices.length === 0) {
            var placeholder = el("span", "exercises-placeholder");
            placeholder.textContent = "Tap the words below";
            answerArea.appendChild(placeholder);
          }
          qState.orderedIndices.forEach(function (tokenIndex, position) {
            var btn = el("button", "exercises-token", { type: "button" });
            btn.textContent = exercise.tokens[tokenIndex];
            btn.disabled = qState.validated;
            btn.addEventListener("click", function () {
              qState.orderedIndices = qState.orderedIndices.filter(function (_, i) {
                return i !== position;
              });
              renderQuestionBody();
              updateActionButton();
            });
            answerArea.appendChild(btn);
          });
          questionBox.appendChild(answerArea);

          var choicesWrap2 = el("div", "exercises-choices");
          displayOrder.forEach(function (tokenIndex) {
            var btn = el("button", "exercises-token", { type: "button" });
            btn.textContent = exercise.tokens[tokenIndex];
            btn.disabled = qState.validated || qState.orderedIndices.indexOf(tokenIndex) !== -1;
            btn.addEventListener("click", function () {
              qState.orderedIndices = qState.orderedIndices.concat([tokenIndex]);
              renderQuestionBody();
              updateActionButton();
            });
            choicesWrap2.appendChild(btn);
          });
          questionBox.appendChild(choicesWrap2);

          if (qState.validated && !qState.isCorrect) {
            var correctP = el("p", "exercises-correct-answer");
            correctP.textContent = "Correct order: " + exercise.answer.join(" ");
            questionBox.appendChild(correctP);
          }
        }

        if (exercise.type === "translation" || exercise.type === "transform") {
          var instrText =
            exercise.type === "translation"
              ? "Translate the following sentence into Chinese:"
              : exercise.instruction || "Transform the following sentence:";
          var instrP = el("p", "exercises-instruction");
          instrP.textContent = instrText;
          questionBox.appendChild(instrP);
          var sourceP = el("p", "exercises-source");
          sourceP.textContent = exercise.type === "translation" ? exercise.prompt : exercise.source;
          questionBox.appendChild(sourceP);
          var input = el("input", "exercises-input", {
            type: "text",
            placeholder: "Type your answer",
          });
          input.value = qState.textAnswer;
          input.disabled = qState.validated;
          input.addEventListener("input", function (event) {
            qState.textAnswer = event.target.value;
            updateActionButton();
          });
          questionBox.appendChild(input);

          if (qState.validated && !qState.isCorrect) {
            var acceptedP = el("p", "exercises-correct-answer");
            acceptedP.textContent = "Accepted: " + exercise.accepted_answers.join(" / ");
            questionBox.appendChild(acceptedP);
          }
        }
      }

      function validate() {
        if (exercise.type === "multiple_choice") {
          qState.isCorrect = qState.selectedChoice === exercise.answer;
        } else if (exercise.type === "sentence_reordering") {
          var orderedTokens = qState.orderedIndices.map(function (i) {
            return exercise.tokens[i];
          });
          qState.isCorrect =
            orderedTokens.length === exercise.answer.length &&
            orderedTokens.every(function (token, i) {
              return token === exercise.answer[i];
            });
        } else {
          qState.isCorrect = isTextAnswerCorrect(qState.textAnswer, exercise.accepted_answers);
        }
        qState.validated = true;
        if (qState.isCorrect) state.correctCount += 1;
        renderQuestionBody();
        updateActionButton();
        feedbackText.textContent = qState.isCorrect ? "Correct!" : "Not quite.";
        feedbackText.className = qState.isCorrect ? "feedback-correct" : "feedback-incorrect";
      }

      function next() {
        if (state.index + 1 >= exercises.length) {
          state.finished = true;
          render();
          return;
        }
        state.index += 1;
        render();
      }

      renderQuestionBody();
      updateActionButton();
      root.innerHTML = "";
      root.appendChild(container);
    }

    render();
  }

  document.addEventListener("DOMContentLoaded", function () {
    initTabs();
    initExercises();
  });
})();
