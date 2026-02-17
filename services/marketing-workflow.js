// ═══════════════════════════════════════════════════════════════════════════
// ZENITH OS — MARKETING SUITE — WORKFLOW STATE MACHINE
// Enforces valid state transitions with guard conditions and audit logging
// Main Street Group LLC © 2026
// ═══════════════════════════════════════════════════════════════════════════

// ── STATE DEFINITIONS ───────────────────────────────────────────────────
const STATES = {
  PENDING:      'pending',
  READY:        'ready',
  GENERATING:   'generating',
  REVIEW:       'review',
  REVISION:     'revision',
  APPROVAL:     'approval',
  APPROVED:     'approved',
  DISTRIBUTED:  'distributed',
  FAILED:       'failed',
};

// ── TRANSITION MAP ──────────────────────────────────────────────────────
// Defines all valid transitions and their guard conditions
const TRANSITIONS = {
  // pending → ready: Listing data passes validation
  validate: {
    from: STATES.PENDING,
    to: STATES.READY,
    guard: (draft, listing) => {
      const errors = [];
      if (!listing.address) errors.push('Missing address');
      if (!listing.listing_type) errors.push('Missing listing type');
      if (!listing.broker) errors.push('Missing broker contact');
      // At least 1 photo required
      if (!listing.photo_count || listing.photo_count < 1) errors.push('At least 1 photo required');
      return { valid: errors.length === 0, errors };
    },
    roles: ['system', 'marketing', 'admin'],
  },

  // ready → generating: User triggers generation or auto-trigger fires
  generate: {
    from: STATES.READY,
    to: STATES.GENERATING,
    guard: () => ({ valid: true, errors: [] }),
    roles: ['system', 'marketing', 'admin'],
  },

  // generating → review: AI composition job completes successfully
  complete_generation: {
    from: STATES.GENERATING,
    to: STATES.REVIEW,
    guard: (draft, _, params) => {
      const errors = [];
      if (!params?.pdf_url && !params?.pdf_size_bytes) errors.push('No PDF generated');
      if (params?.quality_score === undefined && params?.quality_score !== 0) errors.push('No quality score');
      return { valid: errors.length === 0, errors };
    },
    roles: ['system'],
  },

  // generating → failed: AI composition job errored
  fail_generation: {
    from: STATES.GENERATING,
    to: STATES.FAILED,
    guard: () => ({ valid: true, errors: [] }),
    roles: ['system'],
  },

  // failed → generating: Retry generation
  retry: {
    from: STATES.FAILED,
    to: STATES.GENERATING,
    guard: (draft) => {
      // Max 3 retries
      const retries = draft.revision_count || 0;
      if (retries >= 3) return { valid: false, errors: ['Max retry limit (3) reached'] };
      return { valid: true, errors: [] };
    },
    roles: ['marketing', 'admin'],
  },

  // review → revision: Marketing team opens in Resonance for editing
  open_resonance: {
    from: STATES.REVIEW,
    to: STATES.REVISION,
    guard: () => ({ valid: true, errors: [] }),
    roles: ['marketing', 'admin'],
  },

  // revision → review: Marketing team saves changes from Resonance
  save_revision: {
    from: STATES.REVISION,
    to: STATES.REVIEW,
    guard: () => ({ valid: true, errors: [] }),
    roles: ['marketing', 'admin'],
  },

  // review → approval: Marketing team sends to broker for approval
  submit_for_approval: {
    from: STATES.REVIEW,
    to: STATES.APPROVAL,
    guard: (draft) => {
      const errors = [];
      if (draft.quality_score < 50) errors.push('Quality score too low for approval (min 50)');
      return { valid: errors.length === 0, errors };
    },
    roles: ['marketing', 'admin'],
  },

  // approval → approved: Broker approves the draft
  approve: {
    from: STATES.APPROVAL,
    to: STATES.APPROVED,
    guard: () => ({ valid: true, errors: [] }),
    roles: ['broker', 'admin'],
  },

  // approval → review: Broker requests revisions (must include comments)
  request_revisions: {
    from: STATES.APPROVAL,
    to: STATES.REVIEW,
    guard: (draft, _, params) => {
      const errors = [];
      if (!params?.comments || params.comments.trim().length === 0) {
        errors.push('Broker must provide revision comments');
      }
      return { valid: errors.length === 0, errors };
    },
    roles: ['broker', 'admin'],
  },

  // approved → distributed: Export job completes and channels configured
  distribute: {
    from: STATES.APPROVED,
    to: STATES.DISTRIBUTED,
    guard: (draft) => {
      const errors = [];
      if (!draft.pdf_url) errors.push('No PDF available for distribution');
      return { valid: errors.length === 0, errors };
    },
    roles: ['system', 'marketing', 'admin'],
  },
};

// ── NOTIFICATION TRIGGERS ───────────────────────────────────────────────
// Defines which notifications fire on each transition

const NOTIFICATIONS = {
  complete_generation: {
    recipients: ['marketing_team'],
    template: 'draft_ready',
    message: (draft) => `Marketing draft ready for review: ${draft.property_name || 'Unknown Property'}`,
  },
  submit_for_approval: {
    recipients: ['broker'],
    template: 'approval_requested',
    message: (draft) => `Marketing material ready for your review: ${draft.property_name || 'Unknown Property'}`,
  },
  request_revisions: {
    recipients: ['marketing_team'],
    template: 'revisions_requested',
    message: (draft) => `Broker requested revisions on ${draft.property_name || 'Unknown Property'}`,
  },
  approve: {
    recipients: ['marketing_team', 'broker'],
    template: 'draft_approved',
    message: (draft) => `${draft.property_name || 'Unknown Property'} flyer approved — distributing`,
  },
  distribute: {
    recipients: ['broker'],
    template: 'distributed',
    message: (draft) => `Your listing is live: ${draft.property_name || 'Unknown Property'}`,
  },
};

// ── STATE MACHINE ENGINE ────────────────────────────────────────────────

class MarketingWorkflow {
  constructor(db) {
    this.db = db;
  }

  /**
   * Execute a state transition on a draft.
   * Returns { success, draft, error } 
   */
  async transition(draftId, transitionName, actorId, actorRole, params = {}) {
    const transition = TRANSITIONS[transitionName];
    if (!transition) {
      return { success: false, error: `Unknown transition: ${transitionName}` };
    }

    // Verify actor role
    if (!transition.roles.includes(actorRole)) {
      return { 
        success: false, 
        error: `Role '${actorRole}' not authorized for transition '${transitionName}'. Required: ${transition.roles.join(', ')}`,
        httpStatus: 403,
      };
    }

    // Load current draft
    const draft = await this.getDraft(draftId);
    if (!draft) {
      return { success: false, error: `Draft not found: ${draftId}`, httpStatus: 404 };
    }

    // Verify current state matches transition's 'from' state
    if (draft.status !== transition.from) {
      return { 
        success: false, 
        error: `Invalid transition: cannot '${transitionName}' from '${draft.status}' (expected '${transition.from}')`,
        httpStatus: 409,
      };
    }

    // Run guard condition
    const guardResult = transition.guard(draft, params.listing || {}, params);
    if (!guardResult.valid) {
      return { 
        success: false, 
        error: `Guard failed: ${guardResult.errors.join('; ')}`,
        httpStatus: 422,
      };
    }

    // Execute the transition
    const updateFields = {
      status: transition.to,
      updated_at: new Date(),
    };

    // Apply transition-specific field updates
    switch (transitionName) {
      case 'complete_generation':
        updateFields.generated_at = new Date();
        if (params.pdf_url) updateFields.pdf_url = params.pdf_url;
        if (params.pdf_size_bytes) updateFields.pdf_size_bytes = params.pdf_size_bytes;
        if (params.quality_score !== undefined) updateFields.quality_score = params.quality_score;
        if (params.quality_report) updateFields.quality_report = JSON.stringify(params.quality_report);
        if (params.ai_content) updateFields.ai_content = JSON.stringify(params.ai_content);
        if (params.photo_classifications) updateFields.photo_classifications = JSON.stringify(params.photo_classifications);
        if (params.ai_model) updateFields.ai_model = params.ai_model;
        if (params.ai_tokens_in) updateFields.ai_tokens_in = params.ai_tokens_in;
        if (params.ai_tokens_out) updateFields.ai_tokens_out = params.ai_tokens_out;
        break;

      case 'fail_generation':
        updateFields.failed_at = new Date();
        updateFields.failure_reason = params.error || 'Unknown error';
        break;

      case 'request_revisions':
        updateFields.broker_comments = params.comments;
        updateFields.revision_count = (draft.revision_count || 0) + 1;
        updateFields.reviewed_by = actorId;
        break;

      case 'approve':
        updateFields.approved_at = new Date();
        updateFields.approved_by = actorId;
        break;

      case 'distribute':
        updateFields.distributed_at = new Date();
        if (params.channels) updateFields.distribution_channels = JSON.stringify(params.channels);
        break;

      case 'submit_for_approval':
        updateFields.reviewed_at = new Date();
        updateFields.reviewed_by = actorId;
        break;

      case 'retry':
        updateFields.revision_count = (draft.revision_count || 0) + 1;
        updateFields.failed_at = null;
        updateFields.failure_reason = null;
        break;
    }

    // Update the draft in database
    const updatedDraft = await this.updateDraft(draftId, updateFields);

    // Record in audit history
    await this.recordHistory(draftId, {
      from_status: draft.status,
      to_status: transition.to,
      actor_id: actorId,
      actor_role: actorRole,
      comments: params.comments || null,
      metadata: JSON.stringify({
        transition: transitionName,
        guard_result: guardResult,
        params: Object.keys(params),
      }),
    });

    // Fire notifications
    const notification = NOTIFICATIONS[transitionName];
    if (notification) {
      await this.sendNotification(notification, updatedDraft, actorId);
    }

    return { success: true, draft: updatedDraft, transition: transitionName };
  }

  /**
   * Get valid transitions from current state for a given role
   */
  getAvailableTransitions(currentStatus, actorRole) {
    return Object.entries(TRANSITIONS)
      .filter(([_, t]) => t.from === currentStatus && t.roles.includes(actorRole))
      .map(([name, t]) => ({
        name,
        to: t.to,
        label: getTransitionLabel(name),
      }));
  }

  // ── DATABASE OPERATIONS ─────────────────────────────────────────────
  // These will use the real pg client in production

  async getDraft(id) {
    if (this.db) {
      const result = await this.db.query(
        'SELECT * FROM marketing_drafts WHERE id = $1',
        [id]
      );
      return result.rows[0] || null;
    }
    // In-memory fallback for testing
    return this._memoryStore?.[id] || null;
  }

  async updateDraft(id, fields) {
    if (this.db) {
      const keys = Object.keys(fields);
      const values = Object.values(fields);
      const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
      
      const result = await this.db.query(
        `UPDATE marketing_drafts SET ${setClauses} WHERE id = $1 RETURNING *`,
        [id, ...values]
      );
      return result.rows[0];
    }
    // In-memory fallback
    if (this._memoryStore?.[id]) {
      Object.assign(this._memoryStore[id], fields);
      return this._memoryStore[id];
    }
    return null;
  }

  async recordHistory(draftId, data) {
    if (this.db) {
      await this.db.query(
        `INSERT INTO marketing_draft_history (draft_id, from_status, to_status, actor_id, actor_role, comments, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [draftId, data.from_status, data.to_status, data.actor_id, data.actor_role, data.comments, data.metadata]
      );
    }
    // Log for testing
    console.log(`  📝 History: ${data.from_status} → ${data.to_status} (by ${data.actor_role})`);
  }

  async sendNotification(notification, draft, actorId) {
    const msg = notification.message(draft);
    console.log(`  🔔 Notification [${notification.recipients.join(', ')}]: ${msg}`);
    // In production: integrate with Zenith notification system / The Huddle
  }

  // ── IN-MEMORY STORE (for testing) ─────────────────────────────────
  initMemoryStore() {
    this._memoryStore = {};
  }

  createMemoryDraft(draft) {
    this._memoryStore[draft.id] = { ...draft };
    return draft;
  }
}

// ── TRANSITION LABELS ───────────────────────────────────────────────────
function getTransitionLabel(name) {
  const labels = {
    validate: 'Validate Data',
    generate: 'Generate Draft',
    complete_generation: 'Mark Complete',
    fail_generation: 'Mark Failed',
    retry: 'Retry Generation',
    open_resonance: 'Edit in Resonance',
    save_revision: 'Save Changes',
    submit_for_approval: 'Send for Approval',
    approve: 'Approve',
    request_revisions: 'Request Revisions',
    distribute: 'Distribute',
  };
  return labels[name] || name;
}

module.exports = { MarketingWorkflow, STATES, TRANSITIONS, NOTIFICATIONS };
