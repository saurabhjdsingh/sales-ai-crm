import { Component, Inject, OnInit, signal, computed, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterModule } from '@angular/router';
import { CompanyService } from '../../services/company.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { ApiService } from '../../../../core/services/api.service';
import { TokenService } from '../../../../core/auth/token.service';
import { environment } from '../../../../../environments/environment';
import { ResearchParserUtil, ParsedResearch, ParsedPerson } from '../../services/research-parser.util';
import { OrgTreeGraphComponent } from '../org-tree-graph/org-tree-graph.component';

export interface ResearchIngestDialogData {
  companyId?: string;
  companyName?: string;
}

@Component({
  selector: 'app-research-ingest-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatDialogModule,
    MatTabsModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    OrgTreeGraphComponent
  ],
  template: `
    <div class="ingest-dialog-container">
      <div class="dialog-header">
        <div class="header-title">
          <mat-icon class="title-icon">auto_stories</mat-icon>
          <div>
            <h2>{{ isExistingCompany ? 'Update Account Research' : 'Import Company & Members from Research' }}</h2>
            <p class="subtitle">Run live Account Intelligence with ChatGPT Plan ($0 metered API cost) or import via Smart Paste/JSON</p>
          </div>
        </div>
        <button mat-icon-button (click)="dialogRef.close()" class="close-btn">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <div class="dialog-content">
        <!-- Mode Switcher (Visible before parsing) -->
        <div class="mode-tabs" *ngIf="!parsedData()">
          <button 
            type="button" 
            class="mode-tab-btn" 
            [class.active]="importMode() === 'chatgpt'" 
            (click)="setImportMode('chatgpt')">
            <mat-icon class="ai-spark-icon">auto_awesome</mat-icon>
            <span>Run with ChatGPT Plan</span>
            <span class="badge-free">$0 Cost</span>
          </button>
          <button 
            type="button" 
            class="mode-tab-btn" 
            [class.active]="importMode() === 'smart'" 
            (click)="setImportMode('smart')">
            <mat-icon>content_paste</mat-icon>
            <span>Smart Paste (HTML / Markdown)</span>
          </button>
          <button 
            type="button" 
            class="mode-tab-btn" 
            [class.active]="importMode() === 'json'" 
            (click)="setImportMode('json')">
            <mat-icon>data_object</mat-icon>
            <span>Import via JSON (ChatGPT Export)</span>
          </button>
        </div>

        <!-- Mode 0: Live Run with ChatGPT Plan -->
        <div class="chatgpt-run-section" *ngIf="!parsedData() && importMode() === 'chatgpt'">
          <!-- Loading status -->
          <div *ngIf="chatgptLoading()" class="loading-state">
            <mat-spinner diameter="32"></mat-spinner>
            <p>Checking ChatGPT Plan connection status...</p>
          </div>

          <!-- Not connected banner -->
          <div *ngIf="!chatgptLoading() && !chatgptConnected()" class="chatgpt-not-connected-card">
            <div class="card-icon-col">
              <div class="chatgpt-logo-badge">
                <mat-icon>psychology</mat-icon>
              </div>
            </div>
            <div class="card-info-col">
              <div class="badge-unlinked">ChatGPT Plan Not Linked</div>
              <h3>Connect Your ChatGPT Plus/Pro Account</h3>
              <p>
                Run deep Radar 36 Account Intelligence at <strong>$0 metered API cost</strong> directly utilizing your
                personal or team ChatGPT subscription (Token Sharing).
              </p>
              
              <div class="quick-connect-instructions">
                <div class="instruction-step">
                  <span class="step-num">1</span>
                  <span>Link your account via 1-command CLI:</span>
                </div>
                <div class="cli-command-box">
                  <code>python manage.py link_chatgpt_plan --email your&#64;email.com</code>
                  <button mat-icon-button (click)="copyCliCommand()" matTooltip="Copy CLI command">
                    <mat-icon>content_copy</mat-icon>
                  </button>
                </div>
                <div class="instruction-step">
                  <span class="step-num">2</span>
                  <span>Or configure in Settings:</span>
                  <a routerLink="/settings" (click)="dialogRef.close()" class="settings-link">
                    Open Settings &rarr; AI Provider
                  </a>
                </div>
              </div>

              <div class="card-actions">
                <button mat-stroked-button (click)="checkChatGPTStatus()" class="recheck-btn">
                  <mat-icon>refresh</mat-icon> Check Connection Again
                </button>
              </div>
            </div>
          </div>

          <!-- Connected and ready to run -->
          <div *ngIf="!chatgptLoading() && chatgptConnected()" class="chatgpt-ready-card">
            <div class="chatgpt-status-header">
              <div class="conn-badge">
                <span class="status-dot"></span>
                <span>ChatGPT Plan Active &bull; {{ chatgptStatus()?.email || 'Connected' }}</span>
              </div>
              <div class="model-select-wrapper">
                <label>Model:</label>
                <select 
                  class="custom-select" 
                  [ngModel]="selectedModel()" 
                  (ngModelChange)="onModelChange($event)" 
                  [disabled]="isStreaming()">
                  @for (m of chatgptModels(); track m.id) {
                    <option [value]="m.id">{{ m.name }}</option>
                  }
                  @if (chatgptModels().length === 0) {
                    <option value="gpt-5.6-terra">GPT-5.6 Terra (Default)</option>
                    <option value="gpt-5.6-luna">GPT-5.6 Luna</option>
                    <option value="gpt-reserve">GPT-Reserve</option>
                  }
                </select>
              </div>
            </div>

            <!-- Company Inputs (if not already existing company) -->
            <div class="company-inputs-grid" *ngIf="!isExistingCompany">
              <div class="input-group">
                <label>Company Name <span class="required">*</span></label>
                <input 
                  type="text" 
                  [ngModel]="chatgptCompanyName()" 
                  (ngModelChange)="chatgptCompanyName.set($event)" 
                  placeholder="e.g. Acme Corporation" 
                  class="custom-input" 
                  [disabled]="isStreaming()"
                />
              </div>
              <div class="input-group">
                <label>Website (optional)</label>
                <input 
                  type="text" 
                  [ngModel]="chatgptWebsite()" 
                  (ngModelChange)="chatgptWebsite.set($event)" 
                  placeholder="https://example.com" 
                  class="custom-input" 
                  [disabled]="isStreaming()"
                />
              </div>
              <div class="input-group">
                <label>Industry (optional)</label>
                <input 
                  type="text" 
                  [ngModel]="chatgptIndustry()" 
                  (ngModelChange)="chatgptIndustry.set($event)" 
                  placeholder="e.g. Cybersecurity, Fintech" 
                  class="custom-input" 
                  [disabled]="isStreaming()"
                />
              </div>
            </div>

            <!-- Existing Company Display -->
            <div class="existing-company-info" *ngIf="isExistingCompany">
              <mat-icon>business</mat-icon>
              <span>Targeting company: <strong>{{ data.companyName }}</strong></span>
            </div>

            <div class="prompt-info-notice">
              <mat-icon>tune</mat-icon>
              <span>Prompts editable in <strong>Settings &rarr; AI Prompts</strong> (Account Intelligence System & User prompts).</span>
            </div>

            <!-- Action button -->
            <div class="run-action-bar">
              <button 
                mat-flat-button 
                color="primary" 
                class="run-ai-btn" 
                (click)="runChatGPTAccountIntelligence()" 
                [disabled]="isStreaming() || (!isExistingCompany && !chatgptCompanyName().trim())">
                <mat-icon>{{ isStreaming() ? 'hourglass_top' : 'auto_awesome' }}</mat-icon>
                <span>{{ isStreaming() ? 'Generating Intelligence...' : 'Run Account Intelligence' }}</span>
              </button>

              <button 
                *ngIf="isStreaming()" 
                mat-stroked-button 
                color="warn" 
                class="cancel-btn" 
                (click)="cancelChatGPTStream()">
                <mat-icon>stop</mat-icon> Cancel
              </button>
            </div>

            <!-- Live Streaming Box -->
            <div class="streaming-console" *ngIf="isStreaming() || streamingText()">
              <div class="console-header">
                <div class="console-title">
                  <span class="live-dot" [class.pulsing]="isStreaming()"></span>
                  <span>Live ChatGPT Stream {{ isStreaming() ? '(Generating...)' : '(Completed)' }}</span>
                </div>
                <div class="console-stats">
                  <span>{{ streamingText().length }} chars generated</span>
                </div>
              </div>
              <pre #streamPre class="console-output">{{ streamingText() }}<span *ngIf="isStreaming()" class="cursor">|</span></pre>
            </div>
          </div>
        </div>

        <!-- Mode 1: Smart Paste Area -->
        <div class="paste-section" *ngIf="!parsedData() && importMode() === 'smart'">
          <div class="paste-dropzone" (paste)="onPaste($event)">
            <mat-icon class="dropzone-icon">content_paste</mat-icon>
            <div class="dropzone-text">
              <h3>Paste ChatGPT Research Here</h3>
              <p>Press <strong>Ctrl + V</strong> (or <strong>Cmd + V</strong>) to paste your ChatGPT company intelligence</p>
            </div>
            <textarea
              [(ngModel)]="manualInputText"
              (ngModelChange)="onTextChange($event)"
              placeholder="Or paste raw text/HTML/JSON here manually..."
              rows="6"
              class="manual-textarea"
            ></textarea>
            <button mat-flat-button color="primary" (click)="parseCurrentInput()" [disabled]="!manualInputText.trim()" class="parse-btn">
              <mat-icon>bolt</mat-icon> Parse Research
            </button>
          </div>
        </div>

        <!-- Mode 2: JSON Import Area -->
        <div class="json-import-section" *ngIf="!parsedData() && importMode() === 'json'">
          <div class="json-card">
            <div class="json-card-header">
              <div class="json-card-title">
                <mat-icon class="json-icon">data_object</mat-icon>
                <div>
                  <h4>Paste ChatGPT JSON Output</h4>
                  <p class="json-subtitle">Supports full Radar 36 Account Intelligence JSON format</p>
                </div>
              </div>
              <div class="json-card-actions">
                <button mat-stroked-button type="button" class="json-action-btn" (click)="formatJsonInput()" [disabled]="!jsonInputText.trim()" matTooltip="Format & Beautify JSON">
                  <mat-icon>auto_fix_high</mat-icon> Beautify
                </button>
                <button mat-button type="button" class="json-action-btn clear-btn" (click)="clearJsonInput()" [disabled]="!jsonInputText.trim()">
                  <mat-icon>delete_outline</mat-icon> Clear
                </button>
              </div>
            </div>

            <!-- JSON Textarea -->
            <div class="json-editor-wrapper">
              <textarea
                [(ngModel)]="jsonInputText"
                (ngModelChange)="onJsonInputChange($event)"
                placeholder='{\n  "report": {\n    "title": "Radar 36 Account Intelligence",\n    "company": {\n      "name": "Target Company",\n      "website": "https://example.com/",\n      "headquarters": { "city": "City", "country": "Country" }\n    },\n    ...\n  }\n}'
                rows="12"
                class="json-textarea"
                spellcheck="false"
              ></textarea>
            </div>

            <!-- Status & Summary Indicator -->
            <div class="json-status-bar" [class.has-error]="!!jsonError()" [class.is-valid]="!!jsonValidSummary()">
              @if (jsonError()) {
                <div class="status-msg error-msg">
                  <mat-icon>error_outline</mat-icon>
                  <span>{{ jsonError() }}</span>
                </div>
              } @else if (jsonValidSummary()) {
                <div class="status-msg success-msg">
                  <mat-icon>check_circle</mat-icon>
                  <span>{{ jsonValidSummary() }}</span>
                </div>
              } @else {
                <div class="status-msg idle-msg">
                  <mat-icon>info_outline</mat-icon>
                  <span>Paste ChatGPT JSON above to inspect and parse report.</span>
                </div>
              }
            </div>

            <div class="json-card-footer">
              <button 
                mat-flat-button 
                color="primary" 
                (click)="parseJsonInput()" 
                [disabled]="!isJsonValid()" 
                class="json-parse-btn">
                <mat-icon>bolt</mat-icon> Parse & Review JSON Report
              </button>
            </div>
          </div>
        </div>

        <!-- Parsed Review State -->
        @if (parsedData(); as parsed) {
          <div class="parsed-review">
            <!-- Review Sub-tabs -->
            <mat-tab-group class="dark-tabs">
              <!-- Tab 1: Company & People Summary -->
              <mat-tab label="Overview & Members">
                <div class="tab-pane">
                  <!-- Company Metadata Card -->
                  <div class="meta-card">
                    <div class="meta-row">
                      <div class="meta-field">
                        <label>Company Name</label>
                        <input type="text" [(ngModel)]="parsed.company_name" class="dossier-input" [disabled]="isExistingCompany" />
                      </div>
                      <div class="meta-field">
                        <label>Industry</label>
                        <input type="text" [(ngModel)]="parsed.industry" class="dossier-input" />
                      </div>
                      <div class="meta-field">
                        <label>Location / HQ</label>
                        <input type="text" [(ngModel)]="parsed.headquarters" class="dossier-input" />
                      </div>
                      <div class="meta-field">
                        <label>Size / Headcount</label>
                        <input type="text" [(ngModel)]="parsed.company_size" class="dossier-input" />
                      </div>
                    </div>
                  </div>

                  <!-- People Selection Table -->
                  <div class="people-section">
                    <div class="people-header">
                      <div class="title-with-badge">
                        <h4>Identified People ({{ selectedPeopleCount() }}/{{ parsed.people.length }})</h4>
                        <span class="subtext">Selected people will be automatically imported into CRM Contacts</span>
                      </div>
                      <div class="people-actions">
                        <button mat-button class="text-btn" (click)="selectAllPeople(true)">Select All</button>
                        <span class="divider">·</span>
                        <button mat-button class="text-btn" (click)="selectAllPeople(false)">Deselect All</button>
                      </div>
                    </div>

                    <div class="people-table-wrapper">
                      <table class="people-table">
                        <thead>
                          <tr>
                            <th width="40"></th>
                            <th>Person</th>
                            <th>Role / Title</th>
                            <th>Classification</th>
                            <th>LinkedIn</th>
                          </tr>
                        </thead>
                        <tbody>
                          @for (p of parsed.people; track p.name) {
                            <tr [class.selected]="p.selected">
                              <td>
                                <mat-checkbox [(ngModel)]="p.selected" color="primary"></mat-checkbox>
                              </td>
                              <td class="name-cell">
                                <span class="person-name">{{ p.name }}</span>
                              </td>
                              <td class="role-cell">{{ p.role }}</td>
                              <td>
                                <span class="pill-badge" [ngClass]="p.classification_type">
                                  {{ p.classification || 'Practitioner' }}
                                </span>
                              </td>
                              <td>
                                <a *ngIf="p.linkedin_url" [href]="p.linkedin_url" target="_blank" rel="noopener noreferrer" class="linkedin-link">
                                  LinkedIn Profile ↗
                                </a>
                                <span *ngIf="!p.linkedin_url" class="no-link">—</span>
                              </td>
                            </tr>
                          }
                          @if (parsed.people.length === 0) {
                            <tr>
                              <td colspan="5" class="empty-cell">No individual practitioners detected in this dump.</td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </mat-tab>

              <!-- Tab 2: Interactive Org Tree Preview -->
              <mat-tab label="Org Hierarchy Graph">
                <div class="tab-pane">
                  <app-org-tree-graph [orgData]="parsed.org_chart_data" [companyId]="data.companyId || ''"></app-org-tree-graph>
                </div>
              </mat-tab>

              <!-- Tab 3: Rendered Dossier Preview -->
              <mat-tab label="Full Dossier HTML">
                <div class="tab-pane">
                  <div class="dossier-preview-box" [innerHTML]="parsed.formatted_html"></div>
                </div>
              </mat-tab>
            </mat-tab-group>
          </div>
        }
      </div>

      <!-- Dialog Footer -->
      <div class="dialog-footer">
        <button mat-stroked-button (click)="resetPaste()" *ngIf="parsedData()" class="repaste-btn">
          <mat-icon>refresh</mat-icon> Reset / Different Research
        </button>
        <div class="footer-spacer"></div>
        <button mat-button (click)="dialogRef.close()" class="cancel-btn">Cancel</button>

        @if (parsedData(); as parsed) {
          <button mat-flat-button color="primary" (click)="saveAndIngest()" [disabled]="submitting()" class="submit-btn">
            @if (submitting()) {
              <mat-spinner diameter="18"></mat-spinner>
              <span>Ingesting...</span>
            } @else {
              <mat-icon>check</mat-icon>
              <span>{{ isExistingCompany ? 'Update Dossier & Sync Contacts' : 'Create Company & Import (' + selectedPeopleCount() + ' Members)' }}</span>
            }
          </button>
        }
      </div>
    </div>
  `,
  styles: [`
    .ingest-dialog-container {
      background: #090d16;
      color: #f1f5f9;
      width: 100%;
      max-width: 920px;
      min-width: 280px;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      border-radius: 12px;
      overflow: hidden;
      box-sizing: border-box;
    }

    .dialog-header {
      padding: 1.25rem 1.5rem;
      border-bottom: 1px solid #1e293b;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #0f172a;
      flex-shrink: 0;

      .header-title {
        display: flex;
        align-items: center;
        gap: 0.85rem;

        .title-icon {
          color: #38bdf8;
          font-size: 28px;
          width: 28px;
          height: 28px;
        }

        h2 {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 600;
        }

        .subtitle {
          margin: 0;
          font-size: 0.8rem;
          color: #94a3b8;
        }
      }

      .close-btn {
        color: #94a3b8;
      }
    }

    .dialog-content {
      padding: 1.5rem;
      overflow-y: auto;
      flex: 1;
      box-sizing: border-box;
    }

    /* Mode Tabs */
    .mode-tabs {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1.25rem;
      background: #0f172a;
      padding: 4px;
      border-radius: 8px;
      border: 1px solid #1e293b;
      width: fit-content;
    }

    .mode-tab-btn {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: transparent;
      border: none;
      border-radius: 6px;
      color: #94a3b8;
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;

      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }

      &:hover {
        color: #f1f5f9;
      }

      &.active {
        background: #1e293b;
        color: #38bdf8;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
      }
    }

    /* ChatGPT Run Mode Styles */
    .badge-free {
      background: linear-gradient(135deg, #059669, #10b981);
      color: #ffffff;
      font-size: 10px;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .ai-spark-icon {
      color: #10b981 !important;
    }

    .chatgpt-run-section {
      width: 100%;
    }

    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      padding: 3rem;
      color: #94a3b8;
    }

    .chatgpt-not-connected-card {
      background: #0b1120;
      border: 1px solid #1e293b;
      border-radius: 12px;
      padding: 1.5rem;
      display: flex;
      gap: 1.5rem;

      .card-icon-col {
        .chatgpt-logo-badge {
          width: 52px;
          height: 52px;
          border-radius: 12px;
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.25);
          display: flex;
          align-items: center;
          justify-content: center;

          mat-icon {
            color: #10b981;
            font-size: 30px;
            width: 30px;
            height: 30px;
          }
        }
      }

      .card-info-col {
        flex: 1;

        .badge-unlinked {
          display: inline-block;
          font-size: 11px;
          font-weight: 600;
          color: #f59e0b;
          background: rgba(245, 158, 11, 0.12);
          border: 1px solid rgba(245, 158, 11, 0.3);
          padding: 2px 8px;
          border-radius: 4px;
          margin-bottom: 0.5rem;
        }

        h3 {
          margin: 0 0 0.5rem;
          font-size: 1.15rem;
          color: #f1f5f9;
        }

        p {
          margin: 0 0 1rem;
          font-size: 0.85rem;
          color: #94a3b8;
          line-height: 1.45;
        }

        .quick-connect-instructions {
          background: #070b14;
          border: 1px solid #1e293b;
          border-radius: 8px;
          padding: 1rem;
          margin-bottom: 1rem;

          .instruction-step {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            font-size: 0.8rem;
            color: #cbd5e1;
            margin-bottom: 0.4rem;

            .step-num {
              width: 18px;
              height: 18px;
              border-radius: 50%;
              background: #334155;
              color: #f8fafc;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 10px;
              font-weight: 700;
            }

            .settings-link {
              color: #38bdf8;
              text-decoration: underline;
              cursor: pointer;
              margin-left: 0.5rem;

              &:hover {
                color: #7dd3fc;
              }
            }
          }

          .cli-command-box {
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: #030712;
            border: 1px solid #1f2937;
            border-radius: 6px;
            padding: 0.4rem 0.75rem;
            margin: 0.35rem 0 0.85rem 1.6rem;

            code {
              font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
              font-size: 0.8rem;
              color: #10b981;
            }

            button {
              width: 28px;
              height: 28px;
              line-height: 28px;
              color: #94a3b8;

              mat-icon {
                font-size: 16px;
                width: 16px;
                height: 16px;
              }

              &:hover {
                color: #f1f5f9;
              }
            }
          }
        }

        .card-actions {
          .recheck-btn {
            border-color: #334155;
            color: #cbd5e1;

            mat-icon {
              font-size: 18px;
              width: 18px;
              height: 18px;
              margin-right: 6px;
            }

            &:hover {
              border-color: #38bdf8;
              color: #38bdf8;
            }
          }
        }
      }
    }

    .chatgpt-ready-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 1.25rem;

      .chatgpt-status-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 1rem;
        padding-bottom: 1rem;
        border-bottom: 1px solid #e2e8f0;
        margin-bottom: 1.25rem;

        .conn-badge {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.85rem;
          font-weight: 600;
          color: #059669;

          .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #10b981;
            box-shadow: 0 0 8px rgba(16, 185, 129, 0.4);
          }
        }

        .model-select-wrapper {
          display: flex;
          align-items: center;
          gap: 0.6rem;

          label {
            font-size: 0.85rem;
            font-weight: 500;
            color: #475569;
          }

          .custom-select {
            background: #ffffff;
            color: #0f172a;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            padding: 0.4rem 0.85rem;
            font-size: 0.85rem;
            font-weight: 500;
            min-width: 220px;
            height: 38px;
            outline: none;
            cursor: pointer;
            transition: all 0.2s;

            &:focus {
              border-color: #0284c7;
              box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.15);
            }

            option {
              background: #ffffff;
              color: #0f172a;
            }
          }
        }
      }

      .company-inputs-grid {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 0.75rem;
        margin-bottom: 1rem;

        .input-group {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;

          label {
            font-size: 0.75rem;
            font-weight: 500;
            color: #475569;

            .required {
              color: #e11d48;
            }
          }

          .custom-input {
            background: #ffffff;
            color: #0f172a;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            padding: 0.5rem 0.75rem;
            font-size: 0.85rem;
            outline: none;
            transition: border-color 0.2s;

            &:focus {
              border-color: #0284c7;
              box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.15);
            }
          }
        }
      }

      .existing-company-info {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        padding: 0.65rem 0.85rem;
        font-size: 0.85rem;
        color: #334155;
        margin-bottom: 1rem;

        mat-icon {
          color: #0284c7;
          font-size: 20px;
          width: 20px;
          height: 20px;
        }

        strong {
          color: #0f172a;
        }
      }

      .prompt-info-notice {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.75rem;
        color: #64748b;
        margin-bottom: 1rem;

        mat-icon {
          font-size: 16px;
          width: 16px;
          height: 16px;
          color: #64748b;
        }

        strong {
          color: #94a3b8;
        }
      }

      .run-action-bar {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 1rem;

        .run-ai-btn {
          height: 40px;
          padding: 0 1.25rem;
          background: linear-gradient(135deg, #0284c7, #2563eb);
          color: #ffffff;
          font-weight: 600;
          font-size: 0.85rem;
          border-radius: 8px;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          box-shadow: 0 2px 10px rgba(37, 99, 235, 0.3);

          mat-icon {
            font-size: 18px;
            width: 18px;
            height: 18px;
          }

          &:disabled {
            background: #1e293b;
            color: #64748b;
            box-shadow: none;
          }
        }

        .cancel-btn {
          height: 40px;
          border-radius: 8px;
        }
      }

      .streaming-console {
        background: #030712;
        border: 1px solid #1f2937;
        border-radius: 8px;
        overflow: hidden;

        .console-header {
          padding: 0.5rem 0.85rem;
          background: #090d16;
          border-bottom: 1px solid #1f2937;
          display: flex;
          justify-content: space-between;
          align-items: center;

          .console-title {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            font-size: 0.75rem;
            color: #94a3b8;

            .live-dot {
              width: 7px;
              height: 7px;
              border-radius: 50%;
              background: #10b981;

              &.pulsing {
                animation: pulse 1.5s infinite;
              }
            }
          }

          .console-stats {
            font-size: 0.7rem;
            color: #64748b;
          }
        }

        .console-output {
          margin: 0;
          padding: 0.85rem;
          max-height: 240px;
          overflow-y: auto;
          font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
          font-size: 0.78rem;
          line-height: 1.45;
          color: #e2e8f0;
          white-space: pre-wrap;
          word-break: break-word;

          .cursor {
            color: #38bdf8;
            font-weight: bold;
            animation: blink 1s step-end infinite;
          }
        }
      }
    }

    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
      70% { box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
      100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
    }

    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }

    /* JSON Import Card */
    .json-import-section {
      width: 100%;
    }

    .json-card {
      background: #0b1120;
      border: 1px solid #1e293b;
      border-radius: 10px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .json-card-header {
      padding: 0.85rem 1.25rem;
      background: #0f172a;
      border-bottom: 1px solid #1e293b;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.75rem;

      .json-card-title {
        display: flex;
        align-items: center;
        gap: 0.75rem;

        .json-icon {
          color: #38bdf8;
          font-size: 24px;
          width: 24px;
          height: 24px;
        }

        h4 {
          margin: 0;
          font-size: 0.95rem;
          font-weight: 600;
          color: #f1f5f9;
        }

        .json-subtitle {
          margin: 0;
          font-size: 0.75rem;
          color: #94a3b8;
        }
      }

      .json-card-actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;

        .json-action-btn {
          font-size: 0.8rem;
          height: 32px;
          line-height: 32px;
          padding: 0 10px;
          color: #94a3b8;
          border-color: #334155;

          mat-icon {
            font-size: 16px;
            width: 16px;
            height: 16px;
            margin-right: 4px;
          }

          &:hover {
            color: #38bdf8;
            border-color: #38bdf8;
          }

          &.clear-btn {
            border: none;
            color: #ef4444;

            &:hover {
              background: rgba(239, 68, 68, 0.1);
            }
          }
        }
      }
    }

    .json-editor-wrapper {
      padding: 1rem;
    }

    .json-textarea {
      width: 100%;
      background: #080d1a;
      border: 1px solid #1e293b;
      border-radius: 6px;
      color: #38bdf8;
      font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
      font-size: 0.82rem;
      line-height: 1.45;
      padding: 0.85rem;
      resize: vertical;
      box-sizing: border-box;

      &:focus {
        outline: none;
        border-color: #38bdf8;
      }
    }

    .json-status-bar {
      padding: 0.6rem 1.25rem;
      background: #090e17;
      border-top: 1px solid #1e293b;
      font-size: 0.82rem;

      .status-msg {
        display: flex;
        align-items: center;
        gap: 0.5rem;

        mat-icon {
          font-size: 18px;
          width: 18px;
          height: 18px;
        }
      }

      .idle-msg {
        color: #94a3b8;
      }

      .error-msg {
        color: #f87171;
      }

      .success-msg {
        color: #4ade80;
      }

      &.has-error {
        background: rgba(239, 68, 68, 0.08);
      }

      &.is-valid {
        background: rgba(34, 197, 94, 0.08);
      }
    }

    .json-card-footer {
      padding: 0.75rem 1.25rem;
      background: #0f172a;
      border-top: 1px solid #1e293b;
      display: flex;
      justify-content: flex-end;

      .json-parse-btn {
        height: 38px;
        font-weight: 500;
      }
    }

    /* Paste Dropzone */
    .paste-dropzone {
      border: 2px dashed #334155;
      border-radius: 12px;
      padding: 2.5rem 1.5rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      background: rgba(15, 23, 42, 0.6);
      gap: 1rem;
      transition: all 0.2s;
      width: 100%;
      box-sizing: border-box;

      &:hover {
        border-color: #38bdf8;
        background: rgba(15, 23, 42, 0.9);
      }

      .dropzone-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
        color: #38bdf8;
      }

      .dropzone-text {
        h3 {
          margin: 0 0 0.4rem;
          font-size: 1.2rem;
        }
        p {
          margin: 0;
          color: #94a3b8;
          font-size: 0.9rem;
        }
      }

      .manual-textarea {
        width: 100%;
        max-width: 600px;
        background: #0f172a;
        border: 1px solid #334155;
        border-radius: 8px;
        color: #f1f5f9;
        padding: 0.75rem;
        font-family: inherit;
        font-size: 0.85rem;
        resize: vertical;

        &:focus {
          outline: none;
          border-color: #38bdf8;
        }
      }

      .parse-btn {
        margin-top: 0.5rem;
      }
    }

    /* Review Tabs */
    .tab-pane {
      padding: 1rem 0;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    .meta-card {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 10px;
      padding: 1rem 1.25rem;
    }

    .meta-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1rem;
    }

    .meta-field {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;

      label {
        font-size: 0.75rem;
        font-weight: 500;
        color: #94a3b8;
      }

      .dossier-input {
        background: #1e293b;
        border: 1px solid #334155;
        border-radius: 6px;
        padding: 0.45rem 0.65rem;
        color: #f8fafc;
        font-size: 0.85rem;

        &:focus {
          outline: none;
          border-color: #38bdf8;
        }
        &:disabled {
          opacity: 0.6;
        }
      }
    }

    /* People Table */
    .people-section {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 10px;
      padding: 1rem 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .people-header {
      display: flex;
      justify-content: space-between;
      align-items: center;

      h4 {
        margin: 0;
        font-size: 0.95rem;
        font-weight: 600;
      }

      .subtext {
        font-size: 0.75rem;
        color: #94a3b8;
      }

      .text-btn {
        font-size: 0.75rem;
        color: #38bdf8;
        padding: 0 0.5rem;
      }

      .divider {
        color: #64748b;
        margin: 0 0.25rem;
      }
    }

    .people-table-wrapper {
      max-height: 280px;
      overflow-y: auto;
      border: 1px solid #1e293b;
      border-radius: 6px;
    }

    .people-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.82rem;

      th {
        background: #1e293b;
        padding: 0.6rem 0.75rem;
        text-align: left;
        color: #94a3b8;
        font-weight: 500;
        border-bottom: 1px solid #334155;
      }

      td {
        padding: 0.6rem 0.75rem;
        border-bottom: 1px solid #1e293b;
      }

      tr.selected {
        background: rgba(56, 189, 248, 0.03);
      }

      .person-name {
        font-weight: 600;
        color: #f1f5f9;
      }

      .pill-badge {
        font-size: 0.7rem;
        padding: 0.15rem 0.5rem;
        border-radius: 4px;
        background: #1e293b;
        border: 1px solid #334155;
        color: #94a3b8;

        &.primary {
          background: rgba(245, 158, 11, 0.15);
          color: #fbbf24;
          border-color: rgba(245, 158, 11, 0.3);
        }
        &.technical {
          background: rgba(99, 102, 241, 0.15);
          color: #a5b4fc;
          border-color: rgba(99, 102, 241, 0.3);
        }
        &.practitioner {
          background: rgba(16, 185, 129, 0.1);
          color: #6ee7b7;
          border-color: rgba(16, 185, 129, 0.25);
        }
      }

      .linkedin-link {
        color: #38bdf8;
        text-decoration: none;
        &:hover { text-decoration: underline; }
      }

      .no-link { color: #64748b; }
      .empty-cell { text-align: center; color: #64748b; padding: 1.5rem; }
    }

    .dossier-preview-box {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 10px;
      padding: 1.5rem;
      max-height: 450px;
      overflow-y: auto;
      font-size: 0.85rem;
      line-height: 1.6;
      color: #cbd5e1;
    }

    .dialog-footer {
      padding: 1rem 1.5rem;
      border-top: 1px solid #1e293b;
      display: flex;
      align-items: center;
      background: #0f172a;
      gap: 0.75rem;
      flex-shrink: 0;

      .footer-spacer { flex: 1; }
      .repaste-btn { color: #94a3b8; }
      .submit-btn {
        background: #0ea5e9;
        color: #fff;
        display: flex;
        align-items: center;
        gap: 0.4rem;
      }
    }

    /* Light Theme Styles */
    :host-context(body.light-theme) .ingest-dialog-container {
      background: #ffffff;
      color: #334155;
    }

    :host-context(body.light-theme) .dialog-header {
      background: #f8fafc;
      border-bottom-color: #e2e8f0;

      .header-title {
        .title-icon {
          color: #0284c7;
        }
        h2 {
          color: #0f172a;
        }
        .subtitle {
          color: #64748b;
        }
      }

      .close-btn {
        color: #64748b;
      }
    }

    :host-context(body.light-theme) .mode-tabs {
      background: #f1f5f9;
      border-color: #cbd5e1;
    }

    :host-context(body.light-theme) .mode-tab-btn {
      color: #64748b;

      &:hover {
        color: #0f172a;
      }

      &.active {
        background: #ffffff;
        color: #0284c7;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      }
    }

    :host-context(body.light-theme) .json-card {
      background: #ffffff;
      border-color: #e2e8f0;
    }

    :host-context(body.light-theme) .json-card-header {
      background: #f8fafc;
      border-bottom-color: #e2e8f0;

      .json-card-title {
        .json-icon {
          color: #0284c7;
        }
        h4 {
          color: #0f172a;
        }
        .json-subtitle {
          color: #64748b;
        }
      }

      .json-card-actions {
        .json-action-btn {
          color: #475569;
          border-color: #cbd5e1;

          &:hover {
            color: #0284c7;
            border-color: #0284c7;
          }

          &.clear-btn {
            color: #dc2626;

            &:hover {
              background: #fee2e2;
            }
          }
        }
      }
    }

    :host-context(body.light-theme) .json-textarea {
      background: #f8fafc;
      border-color: #cbd5e1;
      color: #0f172a;

      &:focus {
        border-color: #0284c7;
      }
    }

    :host-context(body.light-theme) .json-status-bar {
      background: #f8fafc;
      border-top-color: #e2e8f0;

      .idle-msg {
        color: #64748b;
      }
      .error-msg {
        color: #dc2626;
      }
      .success-msg {
        color: #16a34a;
      }

      &.has-error {
        background: #fef2f2;
      }
      &.is-valid {
        background: #f0fdf4;
      }
    }

    :host-context(body.light-theme) .json-card-footer {
      background: #f8fafc;
      border-top-color: #e2e8f0;

      .json-parse-btn {
        background: #0284c7;
        color: #ffffff;

        &:hover {
          background: #0369a1;
        }
      }
    }

    :host-context(body.light-theme) .dialog-content {
      background: #ffffff;
    }

    :host-context(body.light-theme) .paste-dropzone {
      background: #f8fafc;
      border-color: #cbd5e1;

      &:hover {
        border-color: #0284c7;
        background: #f0f9ff;
      }

      .dropzone-icon {
        color: #0284c7;
      }

      .dropzone-text {
        h3 {
          color: #0f172a;
        }
        p {
          color: #64748b;
        }
      }

      .manual-textarea {
        background: #ffffff;
        border-color: #cbd5e1;
        color: #0f172a;

        &:focus {
          border-color: #0284c7;
        }
      }
    }

    :host-context(body.light-theme) .meta-card {
      background: #f8fafc;
      border-color: #e2e8f0;
    }

    :host-context(body.light-theme) .meta-field {
      label {
        color: #475569;
      }

      .dossier-input {
        background: #ffffff;
        border-color: #cbd5e1;
        color: #0f172a;

        &:focus {
          border-color: #0284c7;
        }
      }
    }

    :host-context(body.light-theme) .people-section {
      background: #f8fafc;
      border-color: #e2e8f0;
    }

    :host-context(body.light-theme) .people-header {
      h4 {
        color: #0f172a;
      }
      .subtext {
        color: #64748b;
      }
      .text-btn {
        color: #0284c7;
      }
    }

    :host-context(body.light-theme) .people-table-wrapper {
      border-color: #e2e8f0;
      background: #ffffff;
    }

    :host-context(body.light-theme) .people-table {
      th {
        background: #f1f5f9;
        color: #475569;
        border-bottom-color: #e2e8f0;
      }

      td {
        border-bottom-color: #f1f5f9;
        color: #334155;
      }

      tr.selected {
        background: #f0f9ff;
      }

      .person-name {
        color: #0f172a;
      }

      .pill-badge {
        background: #f1f5f9;
        border-color: #cbd5e1;
        color: #475569;

        &.primary {
          background: #fef3c7;
          color: #92400e;
          border-color: #fde68a;
        }
        &.technical {
          background: #e0e7ff;
          color: #3730a3;
          border-color: #c7d2fe;
        }
        &.practitioner {
          background: #ecfdf5;
          color: #065f46;
          border-color: #a7f3d0;
        }
      }

      .linkedin-link {
        color: #0284c7;
      }
    }

    :host-context(body.light-theme) .dossier-preview-box {
      background: #f8fafc;
      border-color: #e2e8f0;
      color: #334155;

      ::ng-deep h1, ::ng-deep h2, ::ng-deep h3 {
        color: #0f172a;
      }
      ::ng-deep strong, ::ng-deep b {
        color: #0f172a;
      }
      ::ng-deep table {
        background: #ffffff;
        border: 1px solid #e2e8f0;
      }
      ::ng-deep th {
        background: #f1f5f9;
        color: #475569;
        border-bottom: 2px solid #e2e8f0;
      }
      ::ng-deep td {
        border-bottom: 1px solid #f1f5f9;
        color: #334155;
      }
    }

    :host-context(body.light-theme) .dialog-footer {
      background: #f8fafc;
      border-top-color: #e2e8f0;

      .repaste-btn {
        color: #475569;
        border-color: #cbd5e1;
        background: #ffffff;

        &:hover {
          background: #f1f5f9;
        }
      }
      .cancel-btn {
        color: #64748b;

        &:hover {
          background-color: #e2e8f0;
          color: #0f172a;
        }
      }
      .submit-btn {
        background: #0284c7;
        color: #ffffff;

        &:hover {
          background: #0369a1;
        }
      }
    }
  `]
})
export class ResearchIngestDialogComponent implements OnInit {
  readonly importMode = signal<'chatgpt' | 'smart' | 'json'>('chatgpt');
  manualInputText = '';
  jsonInputText = '';
  readonly jsonError = signal<string | null>(null);
  readonly jsonValidSummary = signal<string | null>(null);
  readonly activeSourceType = signal<'chatgpt_plan' | 'chatgpt_plugin' | 'chatgpt_json'>('chatgpt_plan');
  parsedData = signal<ParsedResearch | null>(null);
  submitting = signal(false);

  // ChatGPT Plan Live AI State
  readonly chatgptLoading = signal(true);
  readonly chatgptConnected = signal(false);
  readonly chatgptStatus = signal<any>(null);
  readonly chatgptModels = signal<{ id: string; name: string }[]>([]);
  readonly selectedModel = signal('gpt-5.6-terra');
  readonly chatgptCompanyName = signal('');
  readonly chatgptWebsite = signal('');
  readonly chatgptIndustry = signal('');
  readonly isStreaming = signal(false);
  readonly streamingText = signal('');
  readonly streamStatusText = signal('');
  private abortController: AbortController | null = null;

  @ViewChild('streamPre') streamPreRef?: ElementRef<HTMLPreElement>;

  constructor(
    public dialogRef: MatDialogRef<ResearchIngestDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ResearchIngestDialogData,
    private companyService: CompanyService,
    private notification: NotificationService,
    private router: Router,
    private apiService: ApiService,
    private tokenService: TokenService
  ) {}

  get isExistingCompany(): boolean {
    return !!this.data.companyId;
  }

  ngOnInit(): void {
    if (this.data?.companyName) {
      this.chatgptCompanyName.set(this.data.companyName);
    }
    this.checkChatGPTStatus();
  }

  setImportMode(mode: 'chatgpt' | 'smart' | 'json'): void {
    this.importMode.set(mode);
    if (mode === 'chatgpt' && !this.chatgptStatus()) {
      this.checkChatGPTStatus();
    }
  }

  checkChatGPTStatus(): void {
    this.chatgptLoading.set(true);
    this.apiService.get<any>('/ai/chatgpt/status/').subscribe({
      next: (res) => {
        this.chatgptLoading.set(false);
        this.chatgptConnected.set(!!res?.connected);
        this.chatgptStatus.set(res);
        if (res?.active_model) {
          this.selectedModel.set(res.active_model);
        } else {
          this.apiService.get<any>('/ai/config/').subscribe({
            next: (cfg) => {
              if (cfg?.model_name) {
                this.selectedModel.set(cfg.model_name);
              }
            }
          });
        }
        if (res?.connected) {
          this.loadChatGPTModels();
        }
      },
      error: () => {
        this.chatgptLoading.set(false);
        this.chatgptConnected.set(false);
      }
    });
  }

  loadChatGPTModels(): void {
    this.apiService.get<any>('/ai/chatgpt/models/').subscribe({
      next: (res) => {
        if (res?.models && res.models.length > 0) {
          const list = res.models.map((m: any) => ({
            id: m.slug || m.id,
            name: m.display_name || m.name || m.slug || m.id
          }));
          this.chatgptModels.set(list);

          const savedModel = this.chatgptStatus()?.active_model;
          if (savedModel && list.some((m: { id: string; name: string }) => m.id === savedModel)) {
            this.selectedModel.set(savedModel);
          } else if (!list.some((m: { id: string; name: string }) => m.id === this.selectedModel())) {
            this.selectedModel.set(list[0].id);
          }
        }
      },
      error: () => {}
    });
  }

  onModelChange(newModel: string): void {
    this.selectedModel.set(newModel);
  }

  copyCliCommand(): void {
    const cmd = `python manage.py link_chatgpt_plan --email your@email.com`;
    navigator.clipboard.writeText(cmd);
    this.notification.success('Command copied to clipboard!');
  }

  async runChatGPTAccountIntelligence(): Promise<void> {
    const compName = ((this.isExistingCompany ? this.data?.companyName : this.chatgptCompanyName()) || '').trim();
    if (!compName && !this.data?.companyId) {
      this.notification.error('Company Name is required to run Account Intelligence.');
      return;
    }

    const token = this.tokenService.getAccessToken();
    if (!token) {
      this.notification.error('Authentication session expired. Please log in again.');
      return;
    }

    this.isStreaming.set(true);
    this.streamingText.set('');
    this.streamStatusText.set('Connecting to ChatGPT Plan...');
    this.abortController = new AbortController();

    const payload = {
      company_id: this.data.companyId || null,
      company_name: compName,
      website: this.chatgptWebsite().trim(),
      industry: this.chatgptIndustry().trim(),
      model: this.selectedModel()
    };

    try {
      const response = await fetch(`${environment.apiUrl}/ai/chatgpt/account-intelligence/stream/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload),
        signal: this.abortController.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errMsg = 'Failed to start Account Intelligence';
        try {
          const errObj = JSON.parse(errorText);
          errMsg = errObj.error?.message || errObj.message || errMsg;
        } catch (_) {
          errMsg = errorText || errMsg;
        }
        throw new Error(errMsg);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body streaming is not supported by your browser.');
      }

      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let accumulatedOutput = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;
          const dataStr = trimmedLine.substring(6).trim();
          if (dataStr === '[DONE]') break;

          try {
            const event = JSON.parse(dataStr);
            if (event.type === 'delta') {
              accumulatedOutput += event.delta;
              this.streamingText.set(accumulatedOutput);
              this.scrollConsoleToBottom();
            } else if (event.type === 'completed') {
              accumulatedOutput = event.full_text || accumulatedOutput;
              this.streamingText.set(accumulatedOutput);
              this.handleStreamCompleted(accumulatedOutput, compName);
              return;
            } else if (event.type === 'error') {
              throw new Error(event.message || 'Stream inference error');
            }
          } catch (e: any) {
            if (e.message && !e.message.includes('JSON')) {
              throw e;
            }
          }
        }
      }

      if (accumulatedOutput && !this.parsedData()) {
        this.handleStreamCompleted(accumulatedOutput, compName);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        this.notification.info('Intelligence generation cancelled.');
      } else {
        const msg = err.message || 'Failed to generate intelligence';
        this.streamingText.set((this.streamingText() ? this.streamingText() + '\n\n' : '') + '❌ Error: ' + msg);
        this.notification.error(msg);
      }
    } finally {
      this.isStreaming.set(false);
      this.abortController = null;
    }
  }

  cancelChatGPTStream(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.isStreaming.set(false);
  }

  private scrollConsoleToBottom(): void {
    if (this.streamPreRef?.nativeElement) {
      const el = this.streamPreRef.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }

  private handleStreamCompleted(fullText: string, compName: string): void {
    let cleanText = fullText.trim();
    if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    }

    try {
      let parsed: ParsedResearch;
      if (cleanText.startsWith('{')) {
        try {
          const jsonReport = JSON.parse(cleanText);
          parsed = ResearchParserUtil.parseJson(jsonReport);
        } catch (_) {
          parsed = ResearchParserUtil.parse(cleanText);
        }
      } else {
        parsed = ResearchParserUtil.parse(cleanText);
      }

      if (compName && (!parsed.company_name || parsed.company_name === 'Target Company')) {
        parsed.company_name = compName;
      }

      this.activeSourceType.set('chatgpt_plan');
      this.parsedData.set(parsed);
      this.notification.success(`Account Intelligence Generated! Identified ${parsed.people.length} key members & org structure.`);
    } catch (err: any) {
      this.notification.error('Failed to parse ChatGPT output: ' + (err.message || 'unknown error'));
    }
  }

  onJsonInputChange(text: string): void {
    this.validateJson(text);
  }

  formatJsonInput(): void {
    if (!this.jsonInputText.trim()) return;
    try {
      const parsed = JSON.parse(this.jsonInputText);
      this.jsonInputText = JSON.stringify(parsed, null, 2);
      this.validateJson(this.jsonInputText);
      this.notification.success('JSON beautified successfully');
    } catch (e: any) {
      this.jsonError.set('Cannot beautify: Invalid JSON (' + e?.message + ')');
    }
  }

  clearJsonInput(): void {
    this.jsonInputText = '';
    this.jsonError.set(null);
    this.jsonValidSummary.set(null);
  }

  isJsonValid(): boolean {
    return !this.jsonError() && !!this.jsonValidSummary();
  }

  private validateJson(raw: string): void {
    const trimmed = raw.trim();
    if (!trimmed) {
      this.jsonError.set(null);
      this.jsonValidSummary.set(null);
      return;
    }

    try {
      const obj = JSON.parse(trimmed);
      const root = obj.report || obj;
      const compName = root.company?.name || root.name || 'Company';
      const peopleCount = (root.vapt_team?.people?.length || 0) + 
                          (root.organization_chart?.executive ? 1 : 0);
      const hasOrg = !!(root.organization_chart || root.org_chart_data);

      this.jsonError.set(null);
      this.jsonValidSummary.set(
        `Valid JSON: "${compName}" · ${peopleCount} candidates · ${hasOrg ? 'Org Chart detected' : 'Standard schema'}`
      );
    } catch (e: any) {
      this.jsonError.set('JSON Syntax Error: ' + e?.message);
      this.jsonValidSummary.set(null);
    }
  }

  parseJsonInput(): void {
    const trimmed = this.jsonInputText.trim();
    if (!trimmed) return;

    try {
      const obj = JSON.parse(trimmed);
      const parsed = ResearchParserUtil.parseJson(obj);
      if (this.isExistingCompany && this.data.companyName) {
        parsed.company_name = this.data.companyName;
      }
      this.activeSourceType.set('chatgpt_json');
      this.parsedData.set(parsed);
      this.notification.success(`Parsed JSON report: ${parsed.company_name} with ${parsed.people.length} people identified`);
    } catch (e: any) {
      this.notification.error('Failed to parse JSON report: ' + (e?.message || 'unknown error'));
    }
  }

  onPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const html = event.clipboardData?.getData('text/html') || '';
    const text = event.clipboardData?.getData('text/plain') || '';
    const content = html || text;

    if (content) {
      this.processContent(content);
    }
  }

  onTextChange(text: string): void {
    if (text.length > 100) {
      this.processContent(text);
    }
  }

  parseCurrentInput(): void {
    if (this.manualInputText.trim()) {
      this.processContent(this.manualInputText);
    }
  }

  private processContent(content: string): void {
    try {
      const trimmed = content.trim();
      const isJson = trimmed.startsWith('{') && (trimmed.includes('"report"') || trimmed.includes('"company"'));
      
      const parsed = ResearchParserUtil.parse(content);
      if (this.isExistingCompany && this.data.companyName) {
        parsed.company_name = this.data.companyName;
      }
      this.activeSourceType.set(isJson ? 'chatgpt_json' : 'chatgpt_plugin');
      this.parsedData.set(parsed);
      this.notification.success(`Parsed research: ${parsed.people.length} people identified`);
    } catch (e: any) {
      this.notification.error('Failed to parse pasted research: ' + (e?.message || 'unknown error'));
    }
  }

  resetPaste(): void {
    this.parsedData.set(null);
    this.manualInputText = '';
    this.jsonError.set(null);
    this.jsonValidSummary.set(null);
    this.streamingText.set('');
  }

  selectAllPeople(select: boolean): void {
    const data = this.parsedData();
    if (data) {
      data.people.forEach(p => p.selected = select);
    }
  }

  selectedPeopleCount(): number {
    return this.parsedData()?.people.filter(p => p.selected).length || 0;
  }

  saveAndIngest(): void {
    const parsed = this.parsedData();
    if (!parsed) return;

    this.submitting.set(true);

    const payload = {
      company_id: this.data.companyId || null,
      name: parsed.company_name,
      industry: parsed.industry,
      country: parsed.country,
      company_size: parsed.company_size,
      website: parsed.website,
      content_html: parsed.formatted_html,
      content_markdown: this.importMode() === 'json' ? this.jsonInputText : (this.streamingText() || this.manualInputText || ''),
      org_chart_data: parsed.org_chart_data,
      people: parsed.people,
      source_type: this.activeSourceType()
    };

    this.companyService.ingestDossier(payload).subscribe({
      next: (res) => {
        this.notification.success(
          `Ingested research for ${res.company_name}! Created: ${res.created_contacts}, Linked: ${res.linked_contacts}`
        );
        this.dialogRef.close({ success: true, result: res });

        // If new company was created, navigate to its detail page
        if (!this.data.companyId && res.company_id) {
          this.router.navigate(['/companies', res.company_id]);
        }
      },
      error: (err) => {
        this.notification.error(err.error?.error || 'Failed to ingest research dossier');
        this.submitting.set(false);
      }
    });
  }
}
