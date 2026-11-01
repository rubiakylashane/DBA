/* js/owner/pet-form.js
   Add a new pet / Edit pet.
   The page decides which one with <body data-mode="add"> or "edit".
*/
(async () => {
  const P = window.PawPets || {
    get: () => null,
    add: () => {},
    update: () => {},
    setFlash: () => {}
  };

  const $ = (id) => document.getElementById(id);
  const mode = document.body.dataset.mode === "edit" ? "edit" : "add";

  /* ----- Breed lists ----- */
  const BREED_LISTS = {
    Dog: [
      "Aspin", "Akita", "Beagle", "Bichon Frise", "Border Collie",
      "Boxer", "Chihuahua", "Cocker Spaniel", "Corgi", "Dachshund",
      "Dalmatian", "Doberman", "English Bulldog", "French Bulldog",
      "German Shepherd", "Golden Retriever", "Great Dane",
      "Jack Russell Terrier", "Labrador Retriever", "Maltese",
      "Pit Bull", "Pomeranian", "Poodle", "Pug", "Rottweiler",
      "Samoyed", "Shiba Inu", "Shih Tzu", "Siberian Husky",
      "Yorkshire Terrier"
    ],
    Cat: [
      "Puspin", "Abyssinian", "American Shorthair", "Bengal",
      "Birman", "British Shorthair", "Burmese", "Exotic Shorthair",
      "Himalayan", "Maine Coon", "Munchkin", "Norwegian Forest Cat",
      "Persian", "Ragdoll", "Russian Blue", "Scottish Fold",
      "Siamese", "Sphynx"
    ],
    Rabbit: [
      "Dutch", "English Angora", "Flemish Giant", "Holland Lop",
      "Lionhead", "Mini Lop", "Mini Rex", "Netherland Dwarf", "Rex"
    ],
    Bird: [
      "African Grey", "Budgerigar (Parakeet)", "Canary", "Cockatiel",
      "Cockatoo", "Conure", "Finch", "Lovebird", "Macaw", "Parrot"
    ],
    Hamster: [
      "Chinese", "Dwarf Campbell", "Roborovski", "Syrian", "Winter White"
    ],
    "Guinea Pig": [
      "Abyssinian", "American", "Peruvian", "Skinny Pig", "Teddy"
    ],
    Chinchilla: ["Beige", "Black Velvet", "Standard Gray", "White"],
    Ferret: ["Albino", "Cinnamon", "Sable", "Standard"],
    Hedgehog: ["African Pygmy"],
    Turtle: ["Box Turtle", "Red-eared Slider", "Tortoise"],
    Lizard: ["Bearded Dragon", "Chameleon", "Iguana", "Leopard Gecko"],
    Snake: ["Ball Python", "Corn Snake"],
    Fish: ["Arowana", "Betta", "Goldfish", "Guppy", "Koi"],
    Other: []
  };

  const TOP = new Set(["Aspin", "Puspin"]);
  const BREEDS = {};

  Object.keys(BREED_LISTS).forEach((species) => {
    const list = BREED_LISTS[species];
    const top = list.filter((breed) => TOP.has(breed));
    const rest = list
      .filter((breed) => !TOP.has(breed))
      .sort((a, b) => a.localeCompare(b));

    BREEDS[species] = [
      ...top,
      ...rest,
      ...(species === "Other" ? [] : ["Mixed breed"]),
      "Other"
    ];
  });

  const form = $("pet-form");
  if (!form) return;
  const backend = Boolean(window.PawApi && window.PawApi.isBackendSession());

  const f = {
    name: $("name"),
    species: $("species"),
    breed: $("breed"),
    sex: $("sex"),
    dob: $("dob"),
    allergies: $("allergies"),
    notes: $("notes"),
    photo: $("photo")
  };

  let photoData = "";
  let editingId = null;

  /* ----- Species -> breed list ----- */
  if (f.species) {
    Object.keys(BREEDS).forEach((species) => {
      f.species.add(new Option(species, species));
    });
  }

  function fillBreeds(species, selected) {
    if (!f.breed) return;

    f.breed.length = 1;

    const list = BREEDS[species] || [];

    list.forEach((breed) => {
      f.breed.add(new Option(breed, breed));
    });
    f.breed.add(new Option("Unknown / not sure", "Unknown"));

    if (selected && !list.includes(selected) && selected !== "Unknown") {
      f.breed.add(new Option(selected, selected));
    }

    f.breed.disabled = !species;
    f.breed.value = selected || "";
  }

  fillBreeds("", "");

  if (f.species) {
    f.species.addEventListener("change", () => {
      fillBreeds(f.species.value, "");
    });
  }

  /* ----- Date of birth handling ----- */
  const pad = (n) => String(n).padStart(2, "0");

  const toIso = (date) =>
    date.getFullYear() + "-" +
    pad(date.getMonth() + 1) + "-" +
    pad(date.getDate());

  const todayIso = toIso(new Date());

  /*
    Birthday input format: MM/DD/YYYY
    Example: 10182020 -> 10/18/2020
  */
  if (f.dob) {
    f.dob.type = "text";
    f.dob.placeholder = "MM/DD/YYYY";
    f.dob.maxLength = 10;
    f.dob.inputMode = "numeric";
    f.dob.autocomplete = "bday";

    f.dob.addEventListener("input", () => {
      const digits = f.dob.value
        .replace(/\D/g, "")
        .slice(0, 8);

      let formatted = digits.slice(0, 2);

      if (digits.length > 2) {
        formatted += "/" + digits.slice(2, 4);
      }

      if (digits.length > 4) {
        formatted += "/" + digits.slice(4, 8);
      }

      f.dob.value = formatted;
      setError("dob", "");
    });
  }

  /*
    Converts MM/DD/YYYY to YYYY-MM-DD.
    Returns null if the date is invalid.
  */
  function parseDob(text) {
    if (!text) return null;

    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());

    if (!match) return null;

    const month = Number(match[1]);
    const day = Number(match[2]);
    const year = Number(match[3]);

    // Prevent invalid years and impossible calendar dates.
    if (year < 1000 || year > 9999) return null;

    const date = new Date(year, month - 1, day);

    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null;
    }

    return `${year}-${pad(month)}-${pad(day)}`;
  }

  /* ----- Calendar button (needs js/owner/calendar.js) ----- */
  const dobBtn = $("dob-btn");
  const dobNative = $("dob-picker");
  const showDob = (iso) => { const p = iso.split("-"); return p[1] + "/" + p[2] + "/" + p[0]; };

  if (dobBtn && f.dob) {
    dobBtn.addEventListener("click", () => {
      if (!window.PawCalendar) {
        console.error('calendar.js is not loaded - check the <script src="../../js/owner/calendar.js"> path.');
        return;
      }
      const iso = parseDob(f.dob.value);
      window.PawCalendar.open({
        anchor: dobBtn.closest(".pf-date") || dobBtn.parentElement,
        value: iso && iso <= todayIso ? iso : "",
        max: todayIso,
        onPick: (v) => { f.dob.value = showDob(v); setError("dob", ""); }
      });
    });
  }
  if (dobNative && f.dob) {
    dobNative.addEventListener("change", () => {
      if (dobNative.value) { f.dob.value = showDob(dobNative.value); setError("dob", ""); }
    });
  }

  /* ----- Photo upload and preview ----- */
  const preview = $("photo-preview");
  const hint = $("photo-hint");
  const removeBtn = $("photo-remove");

  function setPhoto(dataUrl) {
    photoData = dataUrl || "";

    if (preview) preview.hidden = !photoData;
    if (hint) hint.hidden = !!photoData;
    if (removeBtn) removeBtn.hidden = !photoData;

    if (preview) {
      if (photoData) {
        preview.src = photoData;
      } else {
        preview.removeAttribute("src");
      }
    }
  }

  function resize(file, max = 480) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();

      img.onload = () => {
        const ratio = Math.min(
          1,
          max / Math.max(img.width, img.height)
        );

        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);

        const context = canvas.getContext("2d");

        if (!context) {
          URL.revokeObjectURL(url);
          reject(new Error("Could not process that image."));
          return;
        }

        context.drawImage(
          img,
          0,
          0,
          canvas.width,
          canvas.height
        );

        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read that image."));
      };

      img.src = url;
    });
  }

  if (f.photo) {
    f.photo.addEventListener("change", async () => {
      const file = f.photo.files[0];

      setError("photo", "");

      if (!file) return;

      if (!file.type.startsWith("image/")) {
        f.photo.value = "";
        setError("photo", "Please choose an image file.");
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        f.photo.value = "";
        setError("photo", "Image must be 5 MB or smaller.");
        return;
      }

      try {
        setPhoto(await resize(file));
      } catch (err) {
        setError("photo", err.message);
      }
    });
  }

  if (removeBtn) {
    removeBtn.addEventListener("click", () => {
      if (f.photo) f.photo.value = "";
      setPhoto("");
      setError("photo", "");
    });
  }

  /* ----- Error messages ----- */
  function setError(key, message) {
    const el = $("err-" + key);

    if (el) {
      el.textContent = message || "";
      el.hidden = !message;
    }

    if (f[key]) {
      f[key].setAttribute(
        "aria-invalid",
        message ? "true" : "false"
      );
    }
  }

  /* ----- Edit mode: load existing pet ----- */
  if (mode === "edit") {
    if (backend) {
      try {
        await P.refresh();
      } catch (error) {
        const message = document.createElement("p");
        message.className = "error";
        message.setAttribute("role", "alert");
        message.textContent = "Could not load your pet details. " + error.message;
        form.prepend(message);
        form.querySelectorAll("input, select, textarea, button").forEach((el) => { el.disabled = true; });
        return;
      }
    }
    editingId = new URLSearchParams(location.search).get("id");

    const pet = editingId && P.get(editingId);

    if (!pet) {
      const message = document.createElement("p");
      message.className = "error";
      message.setAttribute("role", "alert");
      message.textContent = "This pet could not be found in your account. Return to My Pets and try again.";
      form.prepend(message);
      return;
    }

    if (f.name) f.name.value = pet.name || "";

    if (f.species) {
      f.species.value = pet.species || "";
      f.species.disabled = !document.body.dataset.speciesEditable;   // admin can correct the species; owners cannot
    }

    fillBreeds(pet.species, pet.breed);

    if (f.sex) f.sex.value = pet.sex || "";

    // An old "N/A" value is not a date, so the field stays empty and a real date must be typed.
    if (f.dob && pet.dob && !/^(?:n\/?a|unknown|not known)$/i.test(String(pet.dob).trim())) {
      // The date is either a plain YYYY-MM-DD, or a full timestamp from the backend
      // such as 2024-09-28T16:00:00.000Z (that is midnight of Sept 29 in the Philippines).
      // Display it as MM/DD/YYYY in the input.
      const raw = String(pet.dob).trim();
      const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);

      if (plain) {
        f.dob.value = `${plain[2]}/${plain[3]}/${plain[1]}`;
      } else {
        const d = new Date(raw);   // local date parts, so the Philippine date is shown
        f.dob.value = isNaN(d.getTime())
          ? ""
          : `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
      }
    }

    if (f.allergies) {
      f.allergies.value = pet.allergies || "";
    }

    if (f.notes) {
      f.notes.value = pet.notes || "";
    }

    setPhoto(pet.photo || "");
  }

  /* ----- Submit form ----- */
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = f.name ? f.name.value.trim() : "";
    const rawDob = f.dob ? f.dob.value.trim() : "";
    const parsedDob = parseDob(rawDob);

    const values = {
      name,
      species: f.species ? f.species.value : "",
      breed: f.breed ? f.breed.value : "",
      sex: f.sex ? f.sex.value : "",
      dob: parsedDob || "",
      allergies: f.allergies ? f.allergies.value.trim() : "",
      notes: f.notes ? f.notes.value.trim() : "",
      photo: photoData
    };

    const errors = {};

    if (!name) {
      errors.name = "Enter your pet's name.";
    } else if (name.length > 40) {
      errors.name = "Name must be 40 characters or fewer.";
    }

    if (!values.species) {
      errors.species = "Choose a species.";
    }

    if (!values.breed) {
      errors.breed = "Choose a breed.";
    }

    if (!values.sex) {
      errors.sex = "Choose a sex.";
    }

    if (!rawDob) {
      errors.dob = "Enter the date of birth.";
    } else if (!values.dob) {
      errors.dob = "Enter a valid date in MM/DD/YYYY format.";
    } else if (values.dob > todayIso) {
      errors.dob = "Date of birth can't be in the future.";
    } else if (values.dob < "1990-01-01") {
      errors.dob = "Please check the year.";
    }

    ["name", "species", "breed", "sex", "dob"].forEach((key) => {
      setError(key, errors[key]);
    });

    const firstBad = Object.keys(errors)[0];

    if (firstBad && f[firstBad]) {
      f[firstBad].focus();
      return;
    }

    let submitError = form.querySelector(".submit-error");
    if (!submitError) {
      submitError = document.createElement("p");
      submitError.className = "error submit-error";
      submitError.setAttribute("role", "alert");
    }
    const submit = document.querySelector('button[type="submit"][form="pet-form"]')
      || form.querySelector('button[type="submit"]');
    if (!submit) {
      submitError.textContent = "The save button could not be found. Please reload the page and try again.";
      if (!submitError.isConnected) form.prepend(submitError);
      return;
    }
    if (!submitError.isConnected) {
      submit.before(submitError);
    }
    const originalText = submit.textContent;
    submit.disabled = true;
    submit.textContent = mode === "edit" ? "Saving..." : "Adding pet...";
    submitError.textContent = "";
    try {
      if (backend) {
        // Staff page: the owner comes from the URL (set by owner-pet-shim.js).
        // Owner page: the signed-in owner's own profile.
        const staffOwnerId = document.body.dataset.ownerId;
        const owner = staffOwnerId
          ? { id: staffOwnerId }
          : (await window.PawApi.loadOwners())[0];
        if (!owner) throw new Error("Your owner profile could not be found. Sign out and sign in again.");
        const body = {
          name: values.name,
          species: values.species,
          breed: values.breed,
          dateOfBirth: values.dob || null,
          gender: values.sex,
          allergies: values.allergies || null,
          notes: values.notes || null,
          photo: values.photo || null
        };
        const saved = mode === "edit"
          ? await window.PawApi.request(`/api/owners/${encodeURIComponent(owner.id)}/pets/${encodeURIComponent(editingId)}`, { method: "PATCH", body })
          : await window.PawApi.request(`/api/owners/${encodeURIComponent(owner.id)}/pets`, { method: "POST", body });
        P.cacheApiPet(saved);
      } else if (mode === "edit") {
        P.update(editingId, values);
      } else {
        P.add(values);
      }
      P.setFlash(mode === "edit" ? "Changes saved." : "Pet added.");
      location.href = document.body.dataset.return || "my-pets.html";
    } catch (error) {
      submitError.textContent = error.message || "Could not save your pet. Please try again.";
      submit.disabled = false;
      submit.textContent = originalText;
    }
  });
})();