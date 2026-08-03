import { validateCustomerDraft, emptyCustomerDraft, draftFromSearch } from "./validation";

describe("validateCustomerDraft", () => {
  describe("identity requirement", () => {
    it("rejects a draft with neither phone nor email", () => {
      // Arrange
      const draft = { ...emptyCustomerDraft(), name: "Maria Santos" };

      // Act
      const result = validateCustomerDraft(draft);

      // Assert — mirrors the DB's customers_identity_ck constraint, so the
      // merchant sees the problem at the counter rather than a Postgres error.
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors.form).toMatch(/phone|email/i);
    });

    it("accepts a phone-only draft", () => {
      const draft = { ...emptyCustomerDraft(), name: "Maria", phone: "09171234567" };

      const result = validateCustomerDraft(draft);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.phoneE164).toBe("+639171234567");
      expect(result.value.email).toBeNull();
    });

    it("accepts an email-only draft", () => {
      const draft = { ...emptyCustomerDraft(), name: "Maria", email: "maria@example.com" };

      const result = validateCustomerDraft(draft);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.phoneE164).toBeNull();
      expect(result.value.email).toBe("maria@example.com");
    });
  });

  describe("phone normalization", () => {
    it.each([
      ["09171234567", "+639171234567"],
      ["+63 917 123 4567", "+639171234567"],
      ["9171234567", "+639171234567"],
      ["0917-123-4567", "+639171234567"],
    ])("normalizes %s to %s", (input, expected) => {
      const result = validateCustomerDraft({ ...emptyCustomerDraft(), phone: input });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.phoneE164).toBe(expected);
    });

    it("rejects a phone that cannot be normalized", () => {
      // A junk number must never be stored: it would create a guest who can
      // never be matched again, inflating the customer count with a ghost.
      const result = validateCustomerDraft({ ...emptyCustomerDraft(), phone: "12345" });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors.phone).toBeTruthy();
    });
  });

  describe("email normalization", () => {
    it("lowercases and trims a valid email", () => {
      const result = validateCustomerDraft({
        ...emptyCustomerDraft(),
        email: "  Maria@Example.COM  ",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.email).toBe("maria@example.com");
    });

    it("rejects a malformed email", () => {
      const result = validateCustomerDraft({ ...emptyCustomerDraft(), email: "maria@" });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors.email).toBeTruthy();
    });
  });

  describe("name handling", () => {
    it("trims the name and keeps it", () => {
      const result = validateCustomerDraft({
        ...emptyCustomerDraft(),
        name: "  Maria Santos  ",
        phone: "09171234567",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.name).toBe("Maria Santos");
    });

    it("returns a null name when left blank", () => {
      const result = validateCustomerDraft({ ...emptyCustomerDraft(), phone: "09171234567" });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.name).toBeNull();
    });

    it.each(["Walk-in", "walk in", "POS", "N/A", "guest", "-"])(
      "rejects the placeholder name %s",
      (name) => {
        // Storing "Walk-in" as a real customer is how one phantom regular with
        // hundreds of orders gets created — the exact bug the identity layer
        // was written to prevent.
        const result = validateCustomerDraft({
          ...emptyCustomerDraft(),
          name,
          phone: "09171234567",
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.errors.name).toBeTruthy();
      }
    );
  });

  describe("notes", () => {
    it("trims notes and returns null when blank", () => {
      const withNotes = validateCustomerDraft({
        ...emptyCustomerDraft(),
        phone: "09171234567",
        notes: "  Allergic to shrimp  ",
      });
      const withoutNotes = validateCustomerDraft({
        ...emptyCustomerDraft(),
        phone: "09171234567",
      });

      expect(withNotes.ok).toBe(true);
      if (!withNotes.ok) return;
      expect(withNotes.value.notes).toBe("Allergic to shrimp");

      expect(withoutNotes.ok).toBe(true);
      if (!withoutNotes.ok) return;
      expect(withoutNotes.value.notes).toBeNull();
    });
  });

  describe("multiple problems", () => {
    it("reports every bad field at once rather than the first", () => {
      const result = validateCustomerDraft({
        name: "Walk-in",
        phone: "12345",
        email: "nope@",
        notes: "",
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors.name).toBeTruthy();
      expect(result.errors.phone).toBeTruthy();
      expect(result.errors.email).toBeTruthy();
    });
  });
});

describe("emptyCustomerDraft", () => {
  it("returns a blank draft with every field present", () => {
    expect(emptyCustomerDraft()).toEqual({ name: "", phone: "", email: "", notes: "" });
  });
});

describe("draftFromSearch — turning what the cashier typed into a new guest", () => {
  it("routes a phone-shaped query into the phone field", () => {
    // At the counter the cashier types the number first and the name later,
    // if at all. Putting "0917…" in the name box would fail validation and
    // read as the app rejecting a perfectly good number.
    expect(draftFromSearch("0917 123 4567")).toEqual({
      name: "",
      phone: "0917 123 4567",
      email: "",
      notes: "",
    });
  });

  it.each(["+639171234567", "9171234567", "0917-123-4567"])(
    "recognises %s as a phone",
    (query) => {
      expect(draftFromSearch(query)?.phone).toBe(query);
    },
  );

  it("routes an email-shaped query into the email field", () => {
    expect(draftFromSearch("ana@example.com")?.email).toBe("ana@example.com");
  });

  it("routes anything else into the name field", () => {
    expect(draftFromSearch("Maria Santos")?.name).toBe("Maria Santos");
  });

  it("trims the query", () => {
    expect(draftFromSearch("  Maria  ")?.name).toBe("Maria");
  });

  it("returns null for an empty query", () => {
    expect(draftFromSearch("   ")).toBeNull();
  });

  it("returns null for a placeholder that names nobody", () => {
    // Offering "Save 'walk-in' as a new guest" invites the cashier to create
    // the exact row the validator exists to reject.
    expect(draftFromSearch("walk-in")).toBeNull();
    expect(draftFromSearch("N/A")).toBeNull();
  });
});
