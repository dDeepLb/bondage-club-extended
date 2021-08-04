import { ChatroomCharacter, getPlayerCharacter } from "../characters";
import { ModuleCategory, MODULE_ICONS, MODULE_NAMES } from "../constants";
import { AccessLevel, checkPermisionAccesData, checkPermissionAccess, getPermissionMinDisplayText, PermissionData, PermissionInfo } from "../modules/authority";
import { icon_OwnerList } from "../resources";
import { DrawImageEx } from "../utilsClub";
import { GuiMainMenu } from "./mainmenu";
import { GuiSubscreen } from "./subscreen";
import { GuiAuthorityRoles } from "./authority_roles";
import { GuiAuthorityDialogMin } from "./authority_dialogMin";
import { GuiAuthorityDialogSelf } from "./authority_dialogSelf";
import { setSubscreen } from "../modules/gui";

type PermListItem = (
	{
		separator: false;
		permission: BCX_Permissions;
		permissionInfo: PermissionInfo;
		editSelf: boolean;
		editMin: boolean;
	} | {
		separator: true;
		name: string;
	}
);

const PER_PAGE_COUNT = 6;

export class GuiAuthorityPermissions extends GuiSubscreen {

	readonly character: ChatroomCharacter;
	private permissionData: PermissionData | null = null;
	private myAccessLevel: AccessLevel = AccessLevel.public;
	private failed: boolean = false;
	private permList: PermListItem[] = [];
	private page: number = 0;

	constructor(character: ChatroomCharacter) {
		super();
		this.character = character;
		if (this.character.isPlayer()) {
			this.myAccessLevel = AccessLevel.self;
		}
	}

	Load() {
		this.requestData();
	}

	onChange(sender: number) {
		if (sender === this.character.MemberNumber) {
			this.requestData();
		}
	}

	private requestData() {
		this.permissionData = null;
		this.rebuildList();
		Promise.all([this.character.getPermissions(), this.character.getMyAccessLevel()]).then(res => {
			this.permissionData = res[0];
			this.myAccessLevel = res[1];
			this.rebuildList();
		}, err => {
			console.error(`BCX: Failed to get permission info for ${this.character}`, err);
			this.failed = true;
		});
	}

	private rebuildList() {
		if (!this.active) return;

		const categories: Map<ModuleCategory, PermissionData> = new Map();
		this.permList = [];
		let Input = document.getElementById("BCX_PermissionsFilter") as HTMLInputElement | undefined;
		if (this.permissionData === null) {
			if (Input) {
				Input.remove();
			}
			return;
		}

		if (!Input) {
			Input = ElementCreateInput("BCX_PermissionsFilter", "text", "", "30");
			Input.addEventListener("input", ev => {
				this.rebuildList();
			});
		}

		const filter = Input.value.trim().toLocaleLowerCase().split(" ");

		const access_grantSelf = this.permissionData.authority_grant_self ?
			checkPermisionAccesData(this.permissionData.authority_grant_self, this.myAccessLevel) :
			false;
		const access_revokeSelf = this.permissionData.authority_revoke_self ?
			checkPermisionAccesData(this.permissionData.authority_revoke_self, this.myAccessLevel) :
			false;
		const access_editMin = this.permissionData.authority_edit_min ?
			checkPermisionAccesData(this.permissionData.authority_edit_min, this.myAccessLevel) :
			false;
		const isPlayer = this.myAccessLevel === AccessLevel.self;

		for (const [k, v] of Object.entries(this.permissionData)) {
			let permdata = categories.get(v.category);
			if (filter.some(i =>
				!MODULE_NAMES[v.category].toLocaleLowerCase().includes(i) &&
				!v.name.toLocaleLowerCase().includes(i) &&
				!k.toLocaleLowerCase().includes(i)
			)) continue;
			if (!permdata) {
				categories.set(v.category, permdata = {});
			}
			permdata[k as BCX_Permissions] = v;
		}
		for (const [category, data] of Array.from(categories.entries()).sort((a, b) => a[0] - b[0])) {
			this.permList.push({
				separator: true,
				name: MODULE_NAMES[category]
			});
			for (const [k, v] of Object.entries(data).sort((a, b) => a[1].name.localeCompare(b[1].name))) {
				const access = checkPermisionAccesData(v, this.myAccessLevel);
				this.permList.push({
					separator: false,
					permission: k as BCX_Permissions,
					permissionInfo: v,
					editSelf:
						// character must have access to "allow granting/forbidding self access"
						(v.self ? access_revokeSelf : access_grantSelf) &&
						// Not player must have access to target rule
						(isPlayer || access) &&
						// "minimal access" set to "Self" forces "self access" to "Yes"
						(!v.self || v.min !== AccessLevel.self),
					editMin:
						// Exception: Player can always lower permissions "Self"->"Owner"
						(isPlayer && v.min < AccessLevel.owner) ||
						// Character must have access to "allow minimal access modification" &&
						// Character must have access to target rule
						(access_editMin && access)
				});
			}
		}

		const totalPages = Math.ceil(this.permList.length / PER_PAGE_COUNT);
		if (this.page < 0) {
			this.page = Math.max(totalPages - 1, 0);
		} else if (this.page >= totalPages) {
			this.page = 0;
		}
	}

	Run() {
		if (this.permissionData !== null) {

			DrawTextFit(this.character.Name, 1111, 190, 189, "Black");
			DrawText("is permitted", 1111, 235, "Black");
			DrawText("Lowest permitted role", 1370, 235, "Black");
			MainCanvas.beginPath();
			MainCanvas.moveTo(1335, 230);
			MainCanvas.lineTo(1335, 230 + 610);
			MainCanvas.stroke();

			// filter
			DrawText("Filter:", 130, 215, "Black");
			ElementPosition("BCX_PermissionsFilter", 550, 210, 600, 64);

			//reset button
			if ((document.getElementById("BCX_PermissionsFilter") as HTMLInputElement | undefined)?.value) {
				MainCanvas.textAlign = "center";
				DrawButton(870, 182, 64, 64, "X", "White");
			}

			MainCanvas.textAlign = "left";
			for (let off = 0; off < PER_PAGE_COUNT; off++) {
				const i = this.page * PER_PAGE_COUNT + off;
				if (i >= this.permList.length) break;
				const e = this.permList[i];

				const Y = 275 + off * 100;

				if (e.separator) {
					// idea to highlight the section separator
					MainCanvas.beginPath();
					MainCanvas.rect(125, Y, 1173, 64);
					MainCanvas.fillStyle = "#eeeeee";
					MainCanvas.fill();
					DrawText(`${e.name} module permissions`, 140, Y + 34, "Black");
				} else {
					DrawImageEx(MODULE_ICONS[e.permissionInfo.category], 125, Y, {
						Height: 64,
						Width: 64
					});
					// Permission name
					DrawButton(200, Y, 1000, 64, "", "White");
					DrawTextFit(e.permissionInfo.name, 210, Y + 34, 990, "Black");
					// Self checkbox
					DrawButton(1235, Y, 64, 64, "", e.editSelf ? "White" : "#eee", e.permissionInfo.self ? "Icons/Checked.png" : "", undefined, !e.editSelf);
					// Min access
					MainCanvas.textAlign = "center";
					DrawButton(1370, Y, 170, 64, getPermissionMinDisplayText(e.permissionInfo.min, this.character), e.editMin ? "White" : "#eee", undefined, undefined, !e.editMin);
					MainCanvas.textAlign = "left";
				}
			}

			// Pagination
			const totalPages = Math.max(1, Math.ceil(this.permList.length / PER_PAGE_COUNT));
			MainCanvas.textAlign = "center";
			DrawBackNextButton(1605, 800, 300, 90, `${DialogFindPlayer("Page")} ${this.page + 1} / ${totalPages}`, "White", "", () => "", () => "");
		} else if (this.failed) {
			MainCanvas.textAlign = "center";
			DrawText(`Failed to get permission data from ${this.character.Name}. Maybe you have no access?`, 1000, 480, "Black");
		} else {
			MainCanvas.textAlign = "center";
			DrawText("Loading...", 1000, 480, "Black");
		}

		MainCanvas.textAlign = "left";

		DrawText(`- Authority: Permission Settings for ${this.character.Name} -`, 125, 125, "Black", "Gray");
		MainCanvas.textAlign = "center";
		DrawButton(1815, 75, 90, 90, "", "White", "Icons/Exit.png", "BCX main menu");
		DrawButton(1815, 190, 90, 90, "", "White", icon_OwnerList, "Role management");
	}

	Click() {
		if (MouseIn(1815, 75, 90, 90)) return this.Exit();

		// Owner list
		if (MouseIn(1815, 190, 90, 90)) return setSubscreen(new GuiAuthorityRoles(this.character));

		if (this.permissionData !== null) {

			//reset button
			const elem = document.getElementById("BCX_PermissionsFilter") as HTMLInputElement | undefined;
			if (MouseIn(870, 182, 64, 64) && elem) {
				elem.value = "";
				this.rebuildList();
			}

			for (let off = 0; off < PER_PAGE_COUNT; off++) {
				const i = this.page * PER_PAGE_COUNT + off;
				if (i >= this.permList.length) break;
				const e = this.permList[i];

				const Y = 275 + off * 100;

				if (!e.separator) {
					// Permission name
					if (MouseIn(200, Y, 1000, 64)) {
						// TODO
					}
					// Self checkbox
					if (MouseIn(1235, Y, 64, 64) && e.editSelf) {
						if (e.permissionInfo.self &&
							this.character.isPlayer() &&
							(
								e.permission === "authority_grant_self" ||
								!checkPermissionAccess("authority_grant_self", getPlayerCharacter())
							)
						) {
							// If Player couldn't switch back on, show warning instead
							setSubscreen(new GuiAuthorityDialogSelf(this.character, e.permission, e.permissionInfo, this));
						} else {
							this.character.setPermission(e.permission, "self", !e.permissionInfo.self);
						}
						return;
					}
					// Min access
					if (MouseIn(1370, Y, 170, 64) && e.editMin) {
						const access_editMin = this.permissionData.authority_edit_min ?
							checkPermisionAccesData(this.permissionData.authority_edit_min, this.myAccessLevel) :
							false;
						setSubscreen(new GuiAuthorityDialogMin(
							this.character,
							e.permission,
							e.permissionInfo,
							this.myAccessLevel,
							!access_editMin || !checkPermisionAccesData(e.permissionInfo, this.myAccessLevel),
							this
						));
						return;
					}
				}
			}

			// Pagination
			const totalPages = Math.ceil(this.permList.length / PER_PAGE_COUNT);
			if (MouseIn(1605, 800, 150, 90)) {
				this.page--;
				if (this.page < 0) {
					this.page = Math.max(totalPages - 1, 0);
				}
			} else if (MouseIn(1755, 800, 150, 90)) {
				this.page++;
				if (this.page >= totalPages) {
					this.page = 0;
				}
			}
		}
	}

	Exit() {
		setSubscreen(new GuiMainMenu(this.character));
	}

	Unload() {
		ElementRemove("BCX_PermissionsFilter");
	}
}
