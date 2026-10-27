package org.bunsenbrenner.cads.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import org.bunsenbrenner.cads.R
import org.bunsenbrenner.cads.data.CatalogEntry
import org.bunsenbrenner.cads.data.InstallationsApi
import org.bunsenbrenner.cads.data.deviceTarget
import org.bunsenbrenner.cads.data.userMessageRes
import uniffi.mobile_core.InstallationRecord
import uniffi.mobile_core.InstallationStatus
import uniffi.mobile_core.MobileException
import uniffi.mobile_core.ParamInfo
import uniffi.mobile_core.ParamKind
import uniffi.mobile_core.RenderedPrompt
import uniffi.mobile_core.TemplateInfo
import uniffi.mobile_core.installationInputFromRecord
import uniffi.mobile_core.installationInputFromRender
import uniffi.mobile_core.renderPromptTemplate
import java.text.DateFormat
import java.util.Date

private enum class Tab { Templates, Installations }

@Composable
fun CadsApp(
    catalog: List<CatalogEntry>,
    api: InstallationsApi,
    signedIn: Boolean,
    beforeRequest: suspend () -> Unit,
    onSignIn: () -> Unit,
    onSignOut: () -> Unit,
) {
    MaterialTheme {
        var tab by remember { mutableStateOf(Tab.Templates) }
        var openTemplate by remember { mutableStateOf<CatalogEntry?>(null) }
        var openInstallation by remember { mutableStateOf<InstallationRecord?>(null) }
        var reloadTick by remember { mutableStateOf(0) }

        Scaffold(
            bottomBar = {
                NavigationBar {
                    NavigationBarItem(
                        selected = tab == Tab.Templates,
                        onClick = { tab = Tab.Templates; openTemplate = null; openInstallation = null },
                        icon = { Icon(Icons.Filled.Search, contentDescription = null) },
                        label = { Text(stringResource(R.string.tab_templates)) },
                    )
                    NavigationBarItem(
                        selected = tab == Tab.Installations,
                        onClick = { tab = Tab.Installations; openTemplate = null; openInstallation = null },
                        icon = { Icon(Icons.Filled.Inbox, contentDescription = null) },
                        label = { Text(stringResource(R.string.tab_installations)) },
                    )
                }
            },
        ) { pad ->
            Column(Modifier.padding(pad).fillMaxSize()) {
                val t = openTemplate
                val i = openInstallation
                when {
                    tab == Tab.Templates && t?.info != null -> TemplateDetail(
                        t, t.info, api, signedIn, beforeRequest, onSignIn, onBack = { openTemplate = null },
                    )
                    tab == Tab.Templates -> TemplateList(catalog) { openTemplate = it }
                    i != null -> InstallationDetail(
                        i, catalog, api, beforeRequest,
                        onBack = { openInstallation = null; reloadTick++ },
                    )
                    else -> InstallationList(api, signedIn, beforeRequest, onSignIn, onSignOut, reloadTick) { openInstallation = it }
                }
            }
        }
    }
}

@Composable
private fun Heading(text: String) {
    Text(text, style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { heading() })
}

@Composable
private fun TemplateList(catalog: List<CatalogEntry>, onOpen: (CatalogEntry) -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Heading(stringResource(R.string.templates_title))
        if (catalog.isEmpty()) Text(stringResource(R.string.templates_empty))
        catalog.forEach { e ->
            val info = e.info
            Card(Modifier.fillMaxWidth()) {
                if (info != null) {
                    val status = stringResource(if (info.expired) R.string.trust_expired else R.string.trust_verified_short)
                    Column(
                        Modifier.fillMaxWidth().padding(16.dp).semantics(mergeDescendants = true) {
                            contentDescription = "${info.name}, $status"
                        },
                    ) {
                        Text(info.name, style = MaterialTheme.typography.titleMedium)
                        Text(status)
                        Text("v${info.version}", style = MaterialTheme.typography.bodySmall)
                        TextButton(onClick = { onOpen(e) }) { Text(stringResource(R.string.templates_open)) }
                    }
                } else {
                    Text(stringResource(R.string.trust_unverifiable), Modifier.padding(16.dp), color = MaterialTheme.colorScheme.error)
                }
            }
        }
    }
}

@Composable
private fun TrustPanel(info: TemplateInfo) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            stringResource(if (info.signatureValid) R.string.trust_sig_ok else R.string.trust_sig_bad),
            style = MaterialTheme.typography.titleMedium,
        )
        Text(stringResource(R.string.trust_publisher), style = MaterialTheme.typography.labelMedium)
        Text(info.publisher, fontFamily = FontFamily.Monospace, fontSize = 12.sp)
        Text(stringResource(R.string.trust_valid_until), style = MaterialTheme.typography.labelMedium)
        Text(DateFormat.getDateInstance().format(Date(info.validUntil.toLong() * 1000)))
        if (info.expired) Text(stringResource(R.string.trust_expired), color = MaterialTheme.colorScheme.error)
        Text(stringResource(R.string.trust_components), style = MaterialTheme.typography.titleSmall)
        info.components.forEach { c ->
            Column(Modifier.semantics(mergeDescendants = true) { contentDescription = "${c.name}. SHA-256 ${c.sha256.take(8)}. ${c.usage}" }) {
                Text(c.name, style = MaterialTheme.typography.titleSmall)
                Text("sha256 ${c.sha256}", fontFamily = FontFamily.Monospace, fontSize = 11.sp)
                Text(c.usage, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

/** Editable values for one template; mirrors the web prompt builder's form. */
private class FormState(params: List<ParamInfo>, preset: Map<String, Any> = emptyMap()) {
    val text = mutableStateMapOf<String, String>()
    val choice = mutableStateMapOf<String, String>()
    val multi = mutableStateMapOf<String, Set<String>>()
    val number = mutableStateMapOf<String, String>()
    val color = mutableStateMapOf<String, String>()

    init {
        for (p in params) when (p.kind) {
            ParamKind.TEXT -> text[p.name] = preset[p.name] as? String ?: ""
            ParamKind.ENUM -> choice[p.name] = preset[p.name] as? String ?: p.options.firstOrNull() ?: ""
            ParamKind.MULTISELECT -> multi[p.name] = (preset[p.name] as? List<*>)?.filterIsInstance<String>()?.toSet() ?: emptySet()
            ParamKind.INT -> number[p.name] = ((preset[p.name] as? Number)?.toLong() ?: p.min ?: 0L).toString()
            ParamKind.COLOR -> color[p.name] = preset[p.name] as? String ?: "#336699"
        }
    }

    fun values(params: List<ParamInfo>): Map<String, Any> = buildMap {
        for (p in params) when (p.kind) {
            ParamKind.TEXT -> put(p.name, text[p.name] ?: "")
            ParamKind.ENUM -> put(p.name, choice[p.name] ?: "")
            ParamKind.MULTISELECT -> put(p.name, p.options.filter { multi[p.name]?.contains(it) == true })
            ParamKind.INT -> put(p.name, number[p.name]?.toLongOrNull() ?: Long.MIN_VALUE)
            ParamKind.COLOR -> put(p.name, color[p.name] ?: "")
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TemplateForm(params: List<ParamInfo>, s: FormState) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        params.forEach { p ->
            when (p.kind) {
                ParamKind.TEXT -> OutlinedTextField(
                    value = s.text[p.name] ?: "",
                    onValueChange = { s.text[p.name] = it },
                    label = { Text(p.name) },
                    supportingText = { Text(stringResource(R.string.form_chars, (s.text[p.name] ?: "").length, (p.maxLen ?: 0u).toInt())) },
                    singleLine = !p.multiline,
                    minLines = if (p.multiline) 3 else 1,
                    modifier = Modifier.fillMaxWidth(),
                )
                ParamKind.ENUM -> {
                    var open by remember { mutableStateOf(false) }
                    ExposedDropdownMenuBox(expanded = open, onExpandedChange = { open = it }) {
                        OutlinedTextField(
                            value = s.choice[p.name] ?: "",
                            onValueChange = {},
                            readOnly = true,
                            label = { Text(p.name) },
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(open) },
                            modifier = Modifier.menuAnchor(MenuAnchorType.PrimaryNotEditable).fillMaxWidth(),
                        )
                        ExposedDropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                            p.options.forEach { o ->
                                DropdownMenuItem(text = { Text(o) }, onClick = { s.choice[p.name] = o; open = false })
                            }
                        }
                    }
                }
                ParamKind.MULTISELECT -> Column {
                    Text(p.name, style = MaterialTheme.typography.titleSmall)
                    p.options.forEach { o ->
                        val on = s.multi[p.name]?.contains(o) == true
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Checkbox(checked = on, onCheckedChange = { c ->
                                val cur = s.multi[p.name] ?: emptySet()
                                s.multi[p.name] = if (c) cur + o else cur - o
                            })
                            Text(o, Modifier.padding(top = 12.dp))
                        }
                    }
                    p.note?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                }
                ParamKind.INT -> OutlinedTextField(
                    value = s.number[p.name] ?: "",
                    onValueChange = { v -> if (v.all { it.isDigit() || it == '-' }) s.number[p.name] = v },
                    label = { Text("${p.name} (${p.min}–${p.max})") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                ParamKind.COLOR -> OutlinedTextField(
                    value = s.color[p.name] ?: "",
                    onValueChange = { s.color[p.name] = it },
                    label = { Text("${p.name} (#RRGGBB)") },
                    isError = !FormValues.isHexColor(s.color[p.name] ?: ""),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

private fun now(): ULong = (System.currentTimeMillis() / 1000).toULong()

private fun render(json: String, valuesJson: String): Result<RenderedPrompt> =
    runCatching { renderPromptTemplate(json, valuesJson, now()) }

@Composable
private fun SignInPrompt(onSignIn: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(stringResource(R.string.signin_hint))
        Button(onClick = onSignIn) { Text(stringResource(R.string.signin_button)) }
    }
}

@Composable
private fun TemplateDetail(
    entry: CatalogEntry,
    info: TemplateInfo,
    api: InstallationsApi,
    signedIn: Boolean,
    beforeRequest: suspend () -> Unit,
    onSignIn: () -> Unit,
    onBack: () -> Unit,
) {
    val form = remember(info.templateId) { FormState(info.parameters) }
    val valuesJson = FormValues.toJson(form.values(info.parameters))
    val rendered = render(entry.json, valuesJson)
    var name by remember { mutableStateOf("") }
    var banner by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val savedText = stringResource(R.string.save_done)
    val genericText = stringResource(R.string.err_generic)
    val errorTexts = ErrorTexts()

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        TextButton(onClick = onBack) { Text(stringResource(R.string.back)) }
        Heading(info.name)
        Heading(stringResource(R.string.trust_title))
        TrustPanel(info)
        Heading(stringResource(R.string.form_title))
        TemplateForm(info.parameters, form)
        Heading(stringResource(R.string.preview_title))
        rendered.fold(
            onSuccess = { Text(it.text, fontFamily = FontFamily.Monospace, fontSize = 13.sp) },
            onFailure = { Text(errorTexts.of(it), color = MaterialTheme.colorScheme.error) },
        )
        Heading(stringResource(R.string.save_title))
        if (signedIn) {
            OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text(stringResource(R.string.save_name)) }, modifier = Modifier.fillMaxWidth())
            Button(
                enabled = name.isNotBlank() && rendered.isSuccess && !info.expired,
                onClick = {
                    val r = rendered.getOrNull() ?: return@Button
                    scope.launch {
                        banner = runCatching {
                            beforeRequest()
                            api.create(installationInputFromRender(name.trim(), r, valuesJson, deviceTarget()))
                            savedText
                        }.getOrElse { if (it is MobileException) errorTexts.of(it) else genericText }
                    }
                },
            ) { Text(stringResource(R.string.save_button)) }
        } else {
            SignInPrompt(onSignIn)
        }
        banner?.let { Text(it, modifier = Modifier.semantics { contentDescription = it }) }
    }
}

/** Resolves localized error text inside composition so it can be used from coroutines. */
private class ErrorTexts(
    val unauthorized: String, val notFound: String, val conflict: String, val network: String,
    val badSig: String, val expired: String, val generic: String, val rejected: (String) -> String,
) {
    fun of(t: Throwable): String = when (t) {
        is MobileException.Unauthorized -> unauthorized
        is MobileException.NotFound -> notFound
        is MobileException.Conflict -> conflict
        is MobileException.Network -> network
        is MobileException.BadSignature -> badSig
        is MobileException.Expired -> expired
        is MobileException.Rejected422 -> rejected(t.path.ifEmpty { "-" })
        is MobileException.InvalidValue -> "${t.param}: ${t.message}"
        else -> generic
    }
}

@Composable
private fun ErrorTexts(): ErrorTexts {
    val rejectedFmt = stringResource(R.string.err_rejected, "%s")
    return ErrorTexts(
        stringResource(R.string.err_unauthorized), stringResource(R.string.err_notfound), stringResource(R.string.err_conflict),
        stringResource(R.string.err_network), stringResource(R.string.err_badsignature), stringResource(R.string.err_expired),
        stringResource(R.string.err_generic),
    ) { rejectedFmt.replace("%s", it) }
}

@Composable
private fun InstallationList(
    api: InstallationsApi,
    signedIn: Boolean,
    beforeRequest: suspend () -> Unit,
    onSignIn: () -> Unit,
    onSignOut: () -> Unit,
    reloadTick: Int,
    onOpen: (InstallationRecord) -> Unit,
) {
    var items by remember { mutableStateOf<List<InstallationRecord>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }
    val texts = ErrorTexts()
    LaunchedEffect(signedIn, reloadTick) {
        if (!signedIn) return@LaunchedEffect
        error = try {
            beforeRequest(); items = api.list(); null
        } catch (e: MobileException) {
            texts.of(e)
        }
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Heading(stringResource(R.string.inst_title))
        if (!signedIn) {
            SignInPrompt(onSignIn)
            return@Column
        }
        OutlinedButton(onClick = onSignOut) { Text(stringResource(R.string.signout_button)) }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        if (items.isEmpty() && error == null) Text(stringResource(R.string.inst_empty))
        items.forEach { r ->
            val status = stringResource(statusRes(r.status))
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp).semantics(mergeDescendants = true) { contentDescription = "${r.name}, $status" }) {
                    Text(r.name, style = MaterialTheme.typography.titleMedium)
                    Text(status)
                    TextButton(onClick = { onOpen(r) }) { Text(stringResource(R.string.templates_open)) }
                }
            }
        }
    }
}

private fun statusRes(s: InstallationStatus) = when (s) {
    InstallationStatus.DRAFT -> R.string.status_draft
    InstallationStatus.INSTALLED -> R.string.status_installed
    InstallationStatus.REMOVED -> R.string.status_removed
}

@Composable
private fun InstallationDetail(
    initial: InstallationRecord,
    catalog: List<CatalogEntry>,
    api: InstallationsApi,
    beforeRequest: suspend () -> Unit,
    onBack: () -> Unit,
) {
    var record by remember { mutableStateOf(initial) }
    var name by remember { mutableStateOf(initial.name) }
    val entry = catalog.firstOrNull { it.info?.templateId == record.templateId }
    val params = entry?.info?.parameters ?: emptyList()
    var form by remember { mutableStateOf(FormState(params, FormValues.parse(initial.valuesJson))) }
    var message by remember { mutableStateOf<String?>(null) }
    var conflict by remember { mutableStateOf<Long?>(null) }
    var confirmDelete by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val texts = ErrorTexts()
    val savedText = stringResource(R.string.save_done)
    val reloadedText = stringResource(R.string.conflict_reloaded)
    val dupText = stringResource(R.string.inst_duplicated)

    fun report(e: Throwable) {
        message = texts.of(e)
    }

    suspend fun write(ifMatch: Long) {
        try {
            beforeRequest()
            var input = installationInputFromRecord(record)
            input.name = name.trim()
            if (entry != null) {
                val vj = FormValues.toJson(form.values(params))
                val r = renderPromptTemplate(entry.json, vj, now())
                input.valuesJson = vj
                input.valuesDigest = r.valuesDigest
            }
            record = api.update(record.id, ifMatch, input)
            message = savedText
        } catch (e: MobileException.Conflict) {
            conflict = e.currentRevision ?: (record.revision + 1)
        } catch (e: MobileException) {
            report(e)
        }
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        TextButton(onClick = onBack) { Text(stringResource(R.string.back)) }
        Heading(record.name)
        OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text(stringResource(R.string.inst_name)) }, modifier = Modifier.fillMaxWidth())
        Heading(stringResource(R.string.form_title))
        if (entry != null) TemplateForm(params, form) else Text(stringResource(R.string.inst_template_unknown))
        Heading(stringResource(R.string.trust_components))
        record.components.forEach { c ->
            Column(Modifier.semantics(mergeDescendants = true) {}) {
                Text(c.name, style = MaterialTheme.typography.titleSmall)
                Text("sha256 ${c.sha256}", fontFamily = FontFamily.Monospace, fontSize = 11.sp)
            }
        }
        Text("revision ${record.revision}", style = MaterialTheme.typography.bodySmall)
        Button(onClick = { scope.launch { write(record.revision) } }) { Text(stringResource(R.string.inst_save)) }
        OutlinedButton(onClick = {
            scope.launch {
                try { beforeRequest(); api.duplicate(record.id); message = dupText } catch (e: MobileException) { report(e) }
            }
        }) { Text(stringResource(R.string.inst_duplicate)) }
        OutlinedButton(onClick = { confirmDelete = true }) { Text(stringResource(R.string.inst_delete)) }
        message?.let { Text(it, modifier = Modifier.semantics { contentDescription = it }) }
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text(stringResource(R.string.inst_delete_confirm)) },
            confirmButton = {
                TextButton(onClick = {
                    confirmDelete = false
                    scope.launch {
                        try { beforeRequest(); api.delete(record.id, record.revision); onBack() }
                        catch (e: MobileException.Conflict) { conflict = e.currentRevision ?: (record.revision + 1) }
                        catch (e: MobileException) { report(e) }
                    }
                }) { Text(stringResource(R.string.inst_delete)) }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text(stringResource(R.string.cancel)) } },
        )
    }
    conflict?.let { cur ->
        AlertDialog(
            onDismissRequest = { conflict = null },
            title = { Text(stringResource(R.string.conflict_title)) },
            text = { Text(stringResource(R.string.conflict_message, cur)) },
            // Reload: take the server's version and drop my edits.
            dismissButton = {
                TextButton(onClick = {
                    conflict = null
                    scope.launch {
                        try {
                            beforeRequest()
                            record = api.get(record.id)
                            name = record.name
                            form = FormState(params, FormValues.parse(record.valuesJson))
                            message = reloadedText
                        } catch (e: MobileException) { report(e) }
                    }
                }) { Text(stringResource(R.string.conflict_reload)) }
            },
            // Overwrite: keep my edits, base them on the server's current revision.
            confirmButton = {
                TextButton(onClick = {
                    conflict = null
                    scope.launch {
                        try { beforeRequest(); write(api.get(record.id).revision) } catch (e: MobileException) { report(e) }
                    }
                }) { Text(stringResource(R.string.conflict_overwrite)) }
            },
        )
    }
}
