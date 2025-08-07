(function setupCaseInfo() {
  // Global object available to all scripts
  window.caseInfo = {
    caseNumber: null,
    initials: null,
  };

  const modal = document.getElementById("caseModal");
  const modalCase = document.getElementById("modalCaseNumber");
  const modalInitials = document.getElementById("modalInitials");
  const modalBtn = document.getElementById("modalSubmitBtn");

  // Utility to dispatch to any listeners (aspirate.js, pb.js)
  function notifyReady() {
    document.dispatchEvent(new CustomEvent("caseInfoReady"));
  }

  // Called once we have values
  function setCaseInfo(caseNum, initials) {
    window.caseInfo.caseNumber = caseNum;
    window.caseInfo.initials = initials;
    localStorage.setItem("sharedCaseNumber", caseNum);
    localStorage.setItem("sharedInitials", initials);
    notifyReady();
  }

  // Load from localStorage if available
  function loadFromStorage() {
    const storedCase = localStorage.getItem("sharedCaseNumber");
    const storedInitials = localStorage.getItem("sharedInitials");

    if (storedCase && storedInitials) {
      setCaseInfo(storedCase, storedInitials);
      return true;
    }
    return false;
  }

  // Handle form submission
  modalBtn.onclick = function () {
    const caseVal = modalCase.value.trim();
    const initialsVal = modalInitials.value.trim();

    if (!caseVal || !initialsVal) {
      alert("Please enter both the case number and pathologist initials.");
      return;
    }

    setCaseInfo(caseVal, initialsVal);
    modal.style.display = "none";
  };

  // Show modal unless values are already in storage
  window.addEventListener("load", () => {
    const loaded = loadFromStorage();

    if (!loaded) {
      modal.style.display = "flex";
    }
  });
})();